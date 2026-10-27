// =====================================================================
// GOODIE-MEDHUB — src/lib/billingService.js
//
// Phase 1 service layer. Wraps the offline-first hooks with type-safe
// helpers for:
//   - Looking up services in the catalog
//   - Resolving the effective price for a (service, patient) pair
//     (takes into account the patient's HMO contract price list)
//   - Computing HMO split (HMO covers X%, patient pays Y)
//   - Calling next_document_number() RPC for sequential numbering
//
// Phase 2 will add: invoice lifecycle (draft → finalize), payment
// allocation, credit notes, claim status updates.
//
// USAGE (in any component):
//   import { useBillingCatalog, resolvePriceForPatient } from '../lib/billingService'
//
//   const { catalog, priceLists, contracts, paymentMethods, vendors } = useBillingCatalog()
//   const price = resolvePriceForPatient(catalog, priceLists, contracts, patient, serviceCode)
// =====================================================================

import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOfflineTable } from './useOfflineTable'
import { supabase } from './supabaseClient'

// ---------------------------------------------------------------------
// HOOK: useBillingCatalog
// Loads everything the CashierWorkspace / Settings / PatientProfile
// need to look up prices and contracts. All hospital-scoped via RLS.
// ---------------------------------------------------------------------

export function useBillingCatalog() {
  const { hospital } = useAuth()
  const hospitalId = hospital?.id

  const { records: catalog, loading: catalogLoading } = useOfflineTable('service_catalog', hospitalId)
  const { records: priceLists, loading: priceListsLoading } = useOfflineTable('price_lists', hospitalId)
  const { records: priceListItems, loading: itemsLoading } = useOfflineTable('price_list_items', hospitalId)
  const { records: contracts, loading: contractsLoading } = useOfflineTable('hmo_contracts', hospitalId)
  const { records: paymentMethods, loading: methodsLoading } = useOfflineTable('hospital_payment_methods', hospitalId)
  const { records: vendors, loading: vendorsLoading } = useOfflineTable('expense_vendors', hospitalId)
  const { records: documentSequences } = useOfflineTable('document_sequences', hospitalId)

  return useMemo(() => ({
    catalog: catalog || [],
    priceLists: priceLists || [],
    priceListItems: priceListItems || [],
    contracts: contracts || [],
    paymentMethods: paymentMethods || [],
    vendors: vendors || [],
    documentSequences: documentSequences || [],
    loading: catalogLoading || priceListsLoading || itemsLoading || contractsLoading || methodsLoading || vendorsLoading,
  }), [catalog, priceLists, priceListItems, contracts, paymentMethods, vendors, documentSequences,
       catalogLoading, priceListsLoading, itemsLoading, contractsLoading, methodsLoading, vendorsLoading])
}

// ---------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------

// Find a service in the catalog by code
export function findServiceByCode(catalog, code) {
  if (!catalog || !code) return null
  return catalog.find(s => s.code === code && s.is_active !== false) || null
}

// Find a service in the catalog by id
export function findServiceById(catalog, id) {
  if (!catalog || !id) return null
  return catalog.find(s => s.id === id) || null
}

// Find the patient's HMO contract (if any).
// A patient has an HMO contract if they have hmo_provider set AND
// category === 'hmo'. We match by payer_name (loose) — Phase 2 will
// add a proper patient_hmo_enrollments table with FK to hmo_contracts.
export function findContractForPatient(contracts, patient) {
  if (!contracts || !patient) return null
  if (patient.category !== 'hmo' && !patient.hmo_provider) return null
  if (!patient.hmo_provider || patient.hmo_provider === 'Self-Pay (No HMO)') return null
  return contracts.find(c =>
    c.is_active !== false &&
    c.payer_name === patient.hmo_provider
  ) || null
}

// Resolve the price list for a patient. Priority:
//   1. Their HMO contract's price_list_id (if they're an HMO patient)
//   2. The hospital's default price list (is_default=true)
//   3. null (caller falls back to catalog.default_price)
export function findPriceListForPatient(priceLists, contracts, patient) {
  if (!priceLists || priceLists.length === 0) return null

  // HMO patient → use their contract's price list
  const contract = findContractForPatient(contracts, patient)
  if (contract?.price_list_id) {
    const pl = priceLists.find(p => p.id === contract.price_list_id && p.is_active !== false)
    if (pl) return pl
  }

  // Default price list
  const defaultPl = priceLists.find(p => p.is_default && p.is_active !== false)
  if (defaultPl) return defaultPl

  // First active price list as last resort
  return priceLists.find(p => p.is_active !== false) || null
}

// Resolve the effective price + coverage for a single service for a patient.
// Returns:
//   {
//     service:       the catalog row,
//     price:         the effective price (from price list or catalog default),
//     coveragePercent: 0-100 (HMO covers X%),
//     copayPercent:    0-100 (patient pays Y% of price),
//     copayAmount:     fixed copay (added on top of copayPercent if set),
//     isExcluded:      true if this service is excluded from the price list,
//     priorAuthRequired: true if pre-auth needed,
//     source:        'price_list' | 'catalog_default'
//   }
export function resolvePriceForPatient(catalog, priceLists, priceListItems, contracts, patient, serviceCode) {
  const service = findServiceByCode(catalog, serviceCode)
  if (!service) {
    return null
  }

  const priceList = findPriceListForPatient(priceLists, contracts, patient)
  const contract = findContractForPatient(contracts, patient)

  // Default: catalog price, 100% patient pays
  const result = {
    service,
    price: Number(service.default_price) || 0,
    coveragePercent: 0,
    copayPercent: 100,
    copayAmount: 0,
    isExcluded: false,
    priorAuthRequired: false,
    source: 'catalog_default',
    priceListId: priceList?.id || null,
    contractId: contract?.id || null,
  }

  if (!priceList) return result

  // Look up the override in price_list_items
  const item = priceListItems.find(
    pli => pli.price_list_id === priceList.id && pli.service_catalog_id === service.id
  )

  if (item) {
    result.price = Number(item.price) || result.price
    result.coveragePercent = Number(item.coverage_percent) || 0
    result.copayPercent = Math.max(0, Math.min(100, 100 - result.coveragePercent))
    result.copayAmount = Number(item.copay_amount) || 0
    result.isExcluded = !!item.is_excluded
    result.priorAuthRequired = !!item.prior_auth_required
    result.source = 'price_list'
  } else if (contract) {
    // No specific override for this service in this contract's price list
    // → fall back to the contract's default_coverage_percent
    result.coveragePercent = Number(contract.default_coverage_percent) || 0
    result.copayPercent = Math.max(0, Math.min(100, 100 - result.coveragePercent))
  }

  return result
}

// Compute the HMO split for a given total amount + coverage config.
// Returns:
//   {
//     hmoAmount:    what the HMO covers (may be 0 if no contract),
//     patientAmount: what the patient pays (including any fixed copay),
//     coveragePercent, copayPercent, copayAmount
//   }
export function computeHmoSplit(totalAmount, { coveragePercent = 0, copayPercent = 100, copayAmount = 0 } = {}) {
  const total = Number(totalAmount) || 0
  const cov = Math.max(0, Math.min(100, Number(coveragePercent) || 0))
  const cop = Math.max(0, Math.min(100, Number(copayPercent) || 0))
  const copayFixed = Number(copayAmount) || 0

  // HMO covers cov% of the (total minus fixed copay).
  // The patient pays the rest + the fixed copay.
  const netAfterCopay = Math.max(0, total - copayFixed)
  const hmoAmount = Math.round(netAfterCopay * (cov / 100) * 100) / 100
  const patientAmount = Math.max(0, total - hmoAmount)

  return {
    hmoAmount,
    patientAmount,
    coveragePercent: cov,
    copayPercent: cop,
    copayAmount: copayFixed,
  }
}

// ---------------------------------------------------------------------
// RPC: next_document_number
// Calls the SECURITY DEFINER function from migration 039. Atomic and
// concurrency-safe.
//
// Returns: 'INV-000001' (or null on error)
// ---------------------------------------------------------------------

export async function nextDocumentNumber(hospitalId, docType, fiscalYear = null) {
  if (!hospitalId || !docType) return null
  try {
    const year = fiscalYear ?? new Date().getFullYear()
    const { data, error } = await supabase.rpc('next_document_number', {
      p_hospital_id: hospitalId,
      p_doc_type: docType,
      p_fiscal_year: year,
    })
    if (error) {
      console.warn('next_document_number RPC failed:', error.message)
      // Fallback to a timestamp-based number if the RPC isn't deployed yet
      return `${docType.toUpperCase()}-${Date.now().toString().slice(-6)}`
    }
    return data
  } catch (err) {
    console.warn('next_document_number RPC threw:', err?.message || err)
    return `${docType.toUpperCase()}-${Date.now().toString().slice(-6)}`
  }
}

// ---------------------------------------------------------------------
// CONSTANTS — exported for UI consumption
// ---------------------------------------------------------------------

export const SERVICE_CATEGORIES = [
  { value: 'consultation', label: 'Consultation' },
  { value: 'lab',          label: 'Laboratory' },
  { value: 'procedure',    label: 'Procedure' },
  { value: 'drug',         label: 'Drug / Medication' },
  { value: 'bed',          label: 'Bed / Ward Charge' },
  { value: 'service',      label: 'Service' },
  { value: 'anc_package',  label: 'ANC / Maternity Package' },
  { value: 'registration', label: 'Registration Fee' },
  { value: 'other',        label: 'Other' },
]

export const PRICE_LIST_TYPES = [
  { value: 'standard',  label: 'Standard (Walk-in)' },
  { value: 'hmo',       label: 'HMO Tariff' },
  { value: 'staff',     label: 'Staff Tariff' },
  { value: 'corporate', label: 'Corporate Tariff' },
  { value: 'charity',   label: 'Charity / Subsidised' },
  { value: 'custom',    label: 'Custom' },
]

export const PAYER_TYPES = [
  { value: 'hmo',        label: 'HMO' },
  { value: 'insurance',  label: 'Insurance' },
  { value: 'corporate',  label: 'Corporate' },
  { value: 'government', label: 'Government' },
]

export const VENDOR_TYPES = [
  { value: 'supplier',   label: 'Supplier' },
  { value: 'utility',    label: 'Utility Company' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'staff',      label: 'Staff / Payroll' },
  { value: 'government', label: 'Government / Tax Authority' },
  { value: 'other',      label: 'Other' },
]

export const DOC_TYPES = [
  { value: 'invoice',     label: 'Invoice',     prefix: 'INV-' },
  { value: 'receipt',     label: 'Receipt',     prefix: 'RCT-' },
  { value: 'credit_note', label: 'Credit Note', prefix: 'CN-' },
  { value: 'claim',       label: 'HMO Claim',   prefix: 'CLM-' },
  { value: 'expense',     label: 'Expense',     prefix: 'EXP-' },
  { value: 'statement',   label: 'Statement',   prefix: 'STMT-' },
  { value: 'deposit',     label: 'Deposit',     prefix: 'DEP-' },
]

// Format money as Naira — used everywhere in the billing UI
export function formatMoney(n) {
  const v = Number(n || 0)
  return '₦' + v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// =====================================================================
// PHASE 2 — Invoice lifecycle, payment allocation, credit notes,
// deposits, statement generation
// =====================================================================

// ---------------------------------------------------------------------
// HOOK: useBillingPhase2 — loads all the new Phase 2 tables
// ---------------------------------------------------------------------

export function useBillingPhase2() {
  const { hospital } = useAuth()
  const hospitalId = hospital?.id

  const { records: creditNotes, addRecord: addCreditNote, updateRecord: updateCreditNote } = useOfflineTable('credit_notes', hospitalId)
  const { records: allocations, addRecord: addAllocation, deleteRecord: deleteAllocation } = useOfflineTable('payment_allocations', hospitalId)
  const { records: deposits, addRecord: addDeposit, updateRecord: updateDeposit } = useOfflineTable('deposits', hospitalId)
  const { records: statementRuns, addRecord: addStatementRun, updateRecord: updateStatementRun } = useOfflineTable('statement_runs', hospitalId)
  const { records: invoices, updateRecord: updateInvoice } = useOfflineTable('invoices', hospitalId)
  const { records: payments, addRecord: addPayment, updateRecord: updatePayment } = useOfflineTable('payments', hospitalId)

  return useMemo(() => ({
    creditNotes: creditNotes || [],
    allocations: allocations || [],
    deposits: deposits || [],
    statementRuns: statementRuns || [],
    invoices: invoices || [],
    payments: payments || [],
    // mutators
    addCreditNote, updateCreditNote,
    addAllocation, deleteAllocation,
    addDeposit, updateDeposit,
    addStatementRun, updateStatementRun,
    updateInvoice,
    addPayment, updatePayment,
  }), [creditNotes, allocations, deposits, statementRuns, invoices, payments,
       addCreditNote, updateCreditNote, addAllocation, deleteAllocation,
       addDeposit, updateDeposit, addStatementRun, updateStatementRun,
       updateInvoice, addPayment, updatePayment])
}

// ---------------------------------------------------------------------
// CONSTANTS — Phase 2
// ---------------------------------------------------------------------

export const INVOICE_TYPES = [
  { value: 'outpatient',        label: 'Outpatient' },
  { value: 'inpatient_interim', label: 'Inpatient (Interim)' },
  { value: 'inpatient_final',   label: 'Inpatient (Final)' },
  { value: 'package',           label: 'Package / ANC' },
  { value: 'credit_note',       label: 'Credit Note' },
]

export const DRAFT_STATUSES = [
  { value: 'draft',      label: 'Draft',        color: 'var(--gold)' },
  { value: 'finalized',  label: 'Finalized',    color: 'var(--teal)' },
  { value: 'cancelled',  label: 'Cancelled',    color: 'var(--muted)' },
  { value: 'written_off', label: 'Written Off', color: 'var(--danger)' },
]

export const CREDIT_NOTE_REASONS = [
  { value: 'overcharge',           label: 'Overcharge' },
  { value: 'service_not_rendered', label: 'Service Not Rendered' },
  { value: 'hmo_short_payment',    label: 'HMO Short Payment' },
  { value: 'duplicate_charge',     label: 'Duplicate Charge' },
  { value: 'patient_dispute',      label: 'Patient Dispute' },
  { value: 'pricing_error',        label: 'Pricing Error' },
  { value: 'goodwill',             label: 'Goodwill Gesture' },
  { value: 'other',                label: 'Other' },
]

export const DEPOSIT_STATUSES = [
  { value: 'pending',   label: 'Pending',   color: 'var(--gold)' },
  { value: 'partial',    label: 'Partial',    color: 'var(--blue)' },
  { value: 'allocated',  label: 'Allocated', color: 'var(--teal)' },
  { value: 'refunded',   label: 'Refunded',  color: 'var(--muted)' },
]

// ---------------------------------------------------------------------
// INVOICE LIFECYCLE
// ---------------------------------------------------------------------

// Create a DRAFT invoice (no invoice_number assigned yet — gets one
// when finalized). Used by the new Draft mode in CashierWorkspace.
//
// Returns: { success, invoice?, error? }
export async function createDraftInvoice({
  hospital, profile, patientId, patientName, items, discount = 0, tax = 0,
  invoiceType = 'outpatient', admissionId = null,
  priceListId = null, hmoContractId = null, hmoAuthorizationCode = null,
  hmoProvider = null, hmoCoveragePercent = 0, hmoAmount = 0, patientAmount = 0,
  updateInvoice, writeAudit,
}) {
  if (!hospital?.id || !patientId || !items?.length) {
    return { success: false, error: 'Missing required fields' }
  }
  try {
    const subtotal = items.reduce((s, it) => s + Number(it.total || 0), 0)
    const discountAmt = Number(discount) || 0
    const taxAmt = Number(tax) || 0
    const grandTotal = Math.max(0, subtotal - discountAmt + taxAmt)

    const draftInvoice = await updateInvoice({
      hospital_id: hospital.id,
      patient_id: patientId,
      patient_name: patientName,
      // No invoice_number yet — assigned at finalize time
      invoice_number: `DRAFT-${Date.now().toString().slice(-8)}`,
      invoice_type: invoiceType,
      draft_status: 'draft',
      subtotal,
      amount: grandTotal,
      discount: discountAmt,
      tax: taxAmt,
      grand_total: grandTotal,
      hmo_provider: hmoProvider,
      hmo_coverage_percent: hmoCoveragePercent,
      hmo_amount: hmoAmount,
      patient_amount: patientAmount || grandTotal,
      amount_paid: 0,
      balance: patientAmount || grandTotal,
      status: 'unpaid',
      admission_id: admissionId,
      price_list_id: priceListId,
      hmo_contract_id: hmoContractId,
      hmo_authorization_code: hmoAuthorizationCode,
      created_by: profile?.id,
    })

    writeAudit?.({
      hospitalId: hospital.id, actor: profile,
      action: 'invoice.draft_created',
      entityType: 'invoice', entityId: draftInvoice?.id || null,
      patientId,
      summary: `Created draft invoice for ${patientName} — ${formatMoney(grandTotal)} (${invoiceType})`,
      metadata: { patient_name: patientName, subtotal, discount: discountAmt, tax: taxAmt, grand_total: grandTotal, invoice_type: invoiceType, item_count: items.length },
    })

    return { success: true, invoice: draftInvoice }
  } catch (err) {
    return { success: false, error: err.message || 'Could not create draft invoice' }
  }
}

// Finalize a draft — assigns sequential invoice_number via the
// next_document_number RPC, marks draft_status = 'finalized'.
//
// Returns: { success, invoice?, invoiceNumber?, error? }
export async function finalizeDraftInvoice({
  hospital, profile, invoice, updateInvoice, writeAudit,
}) {
  if (!invoice) return { success: false, error: 'No invoice provided' }
  if (invoice.draft_status === 'finalized') {
    return { success: true, invoice, invoiceNumber: invoice.invoice_number }
  }

  try {
    // Call the RPC for a sequential invoice_number
    const invoiceNumber = await nextDocumentNumber(hospital.id, 'invoice', new Date().getFullYear())
    if (!invoiceNumber) {
      return { success: false, error: 'Could not generate invoice number' }
    }

    await updateInvoice(invoice.id, {
      invoice_number: invoiceNumber,
      draft_status: 'finalized',
      finalized_at: new Date().toISOString(),
    })

    writeAudit?.({
      hospitalId: hospital.id, actor: profile,
      action: 'invoice.finalized',
      entityType: 'invoice', entityId: invoice.id,
      patientId: invoice.patient_id,
      summary: `Finalized invoice ${invoiceNumber} for ${invoice.patient_name} — ${formatMoney(invoice.grand_total || invoice.amount)}`,
      metadata: { invoice_number: invoiceNumber, grand_total: invoice.grand_total, invoice_type: invoice.invoice_type },
    })

    return { success: true, invoiceNumber }
  } catch (err) {
    return { success: false, error: err.message || 'Could not finalize invoice' }
  }
}

// Cancel a draft (cannot cancel finalized invoices — use credit notes).
export async function cancelDraftInvoice({ hospital, profile, invoice, updateInvoice, writeAudit }) {
  if (!invoice) return { success: false, error: 'No invoice provided' }
  if (invoice.draft_status !== 'draft') {
    return { success: false, error: 'Only draft invoices can be cancelled' }
  }
  try {
    await updateInvoice(invoice.id, { draft_status: 'cancelled' })
    writeAudit?.({
      hospitalId: hospital.id, actor: profile,
      action: 'invoice.cancelled',
      entityType: 'invoice', entityId: invoice.id,
      patientId: invoice.patient_id,
      summary: `Cancelled draft invoice ${invoice.invoice_number} for ${invoice.patient_name}`,
      metadata: { invoice_id: invoice.id, draft_invoice_number: invoice.invoice_number },
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message || 'Could not cancel invoice' }
  }
}

// Write off a finalized invoice (with reason — Phase 4 will add approval workflow)
export async function writeOffInvoice({ hospital, profile, invoice, reason, updateInvoice, writeAudit }) {
  if (!invoice) return { success: false, error: 'No invoice provided' }
  if (invoice.draft_status !== 'finalized') {
    return { success: false, error: 'Only finalized invoices can be written off' }
  }
  if (!reason?.trim()) {
    return { success: false, error: 'Reason is required for write-offs' }
  }
  try {
    await updateInvoice(invoice.id, {
      draft_status: 'written_off',
      written_off_reason: reason.trim(),
      written_off_by: profile?.id,
      written_off_at: new Date().toISOString(),
    })
    writeAudit?.({
      hospitalId: hospital.id, actor: profile,
      action: 'invoice.written_off',
      entityType: 'invoice', entityId: invoice.id,
      patientId: invoice.patient_id,
      summary: `Wrote off invoice ${invoice.invoice_number} for ${invoice.patient_name} — ${formatMoney(invoice.balance)} — reason: ${reason.trim()}`,
      metadata: { invoice_id: invoice.id, invoice_number: invoice.invoice_number, balance: invoice.balance, reason: reason.trim() },
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message || 'Could not write off invoice' }
  }
}

// ---------------------------------------------------------------------
// MULTI-INVOICE PAYMENT ALLOCATION
// ---------------------------------------------------------------------

// Allocate a payment across one or more invoices.
//
// `allocations` is an array of { invoice_id, amount }.
// The function:
//   1. Inserts a payments row (with invoice_id = first allocation's invoice_id for backwards compat)
//   2. Inserts payment_allocations rows for each invoice
//   3. Updates each invoice's amount_paid, balance, status
//   4. Emits an audit event
//
// Returns: { success, payment?, allocations?, error? }
export async function allocatePaymentAcrossInvoices({
  hospital, profile, patientId, patientName, totalAmount, method, referenceNumber = null,
  allocations,  // [{ invoice_id, amount }]
  addPayment, addAllocation, updateInvoice, invoices, writeAudit,
}) {
  if (!hospital?.id || !patientId || !totalAmount || !allocations?.length) {
    return { success: false, error: 'Missing required fields' }
  }
  const totalAlloc = allocations.reduce((s, a) => s + Number(a.amount || 0), 0)
  if (Math.abs(totalAlloc - totalAmount) > 0.01) {
    return { success: false, error: `Allocation total (${formatMoney(totalAlloc)}) does not match payment amount (${formatMoney(totalAmount)})` }
  }

  try {
    // 1. Insert the payment row (invoice_id = first allocation's invoice_id)
    const firstInvoiceId = allocations[0].invoice_id
    const payment = await addPayment({
      hospital_id: hospital.id,
      invoice_id: firstInvoiceId,
      patient_id: patientId,
      patient_name: patientName,
      amount: totalAmount,
      method,
      reference_number: referenceNumber || `REF-${Date.now().toString().slice(-6)}`,
      received_by: profile?.id,
    })

    // 2. Insert payment_allocations rows + update each invoice
    for (const alloc of allocations) {
      const amt = Number(alloc.amount || 0)
      if (amt <= 0) continue

      await addAllocation({
        hospital_id: hospital.id,
        payment_id: payment.id,
        invoice_id: alloc.invoice_id,
        amount: amt,
        allocation_type: 'principal',
        allocated_by: profile?.id,
        allocated_by_name: profile?.full_name,
      })

      // Update the invoice's amount_paid, balance, status
      const inv = invoices.find(i => i.id === alloc.invoice_id)
      if (inv) {
        const newPaid = Number(inv.amount_paid || 0) + amt
        const grandTotal = Number(inv.grand_total || inv.amount || 0)
        const newBal = Math.max(0, grandTotal - newPaid)
        const newStatus = newBal <= 0.001 ? 'paid' : (newPaid > 0 ? 'partial' : 'unpaid')
        await updateInvoice(inv.id, {
          amount_paid: newPaid,
          balance: newBal,
          status: newStatus,
          // Assign a receipt_number if this is the first payment on the invoice
          receipt_number: inv.receipt_number || await nextDocumentNumber(hospital.id, 'receipt', new Date().getFullYear()),
        })
      }
    }

    writeAudit?.({
      hospitalId: hospital.id, actor: profile,
      action: 'payment.multi_invoice_allocated',
      entityType: 'payment', entityId: payment.id,
      patientId,
      summary: `Recorded ${formatMoney(totalAmount)} (${method}) for ${patientName} — allocated across ${allocations.length} invoice(s)`,
      metadata: {
        payment_id: payment.id, total_amount: totalAmount, method,
        allocations: allocations.map(a => ({ invoice_id: a.invoice_id, amount: a.amount })),
      },
    })

    return { success: true, payment }
  } catch (err) {
    return { success: false, error: err.message || 'Could not allocate payment' }
  }
}

// ---------------------------------------------------------------------
// CREDIT NOTES
// ---------------------------------------------------------------------

// Create + post a credit note against an invoice.
//
// Refund method determines how the credit is returned:
//   'cash'         → cashier pays out cash (separate payment row with negative amount)
//   'wallet'       → credit the patient's wallet (separate wallet_transaction row)
//   'bank_transfer' → record a bank transfer refund
//   'none'         → just reduce the invoice balance, no refund (used when invoice was unpaid)
//
// Returns: { success, creditNote?, error? }
export async function createCreditNote({
  hospital, profile, invoice, amount, reasonCode, reasonText,
  refundMethod = 'none', refundReference = null,
  addCreditNote, updateInvoice, writeAudit,
}) {
  if (!invoice) return { success: false, error: 'No invoice provided' }
  const amt = Number(amount)
  if (isNaN(amt) || amt <= 0) return { success: false, error: 'Amount must be greater than 0' }
  if (!reasonCode || !reasonText?.trim()) {
    return { success: false, error: 'Reason code and text are required' }
  }

  try {
    // Assign sequential credit_note_number via the RPC
    const cnNumber = await nextDocumentNumber(hospital.id, 'credit_note', new Date().getFullYear())
    if (!cnNumber) return { success: false, error: 'Could not generate credit note number' }

    const creditNote = await addCreditNote({
      hospital_id: hospital.id,
      original_invoice_id: invoice.id,
      credit_note_number: cnNumber,
      amount: amt,
      reason_code: reasonCode,
      reason_text: reasonText.trim(),
      refund_method: refundMethod,
      refund_reference: refundReference,
      status: 'posted',
      posted_at: new Date().toISOString(),
      posted_by: profile?.id,
      created_by: profile?.id,
    })

    // Update the invoice: reduce amount_paid (if was paid) or reduce balance
    const currentPaid = Number(invoice.amount_paid || 0)
    const currentBalance = Number(invoice.balance || 0)
    const grandTotal = Number(invoice.grand_total || invoice.amount || 0)

    let newPaid, newBalance, newStatus
    if (refundMethod === 'none' || refundMethod === 'wallet') {
      // Reduce the invoice balance (no cash leaves the building)
      newBalance = Math.max(0, currentBalance - amt)
      newPaid = Math.max(0, grandTotal - newBalance)
    } else {
      // Cash / bank refund — reduce amount_paid (money is leaving)
      newPaid = Math.max(0, currentPaid - amt)
      newBalance = Math.max(0, grandTotal - newPaid)
    }
    newStatus = newBalance <= 0.001 ? 'paid' : (newPaid > 0 ? 'partial' : 'unpaid')

    await updateInvoice(invoice.id, {
      amount_paid: newPaid,
      balance: newBalance,
      status: newStatus,
    })

    writeAudit?.({
      hospitalId: hospital.id, actor: profile,
      action: 'credit_note.posted',
      entityType: 'credit_note', entityId: creditNote?.id || null,
      patientId: invoice.patient_id,
      summary: `Posted credit note ${cnNumber} for ${formatMoney(amt)} against invoice ${invoice.invoice_number} — reason: ${reasonText.trim()}`,
      metadata: {
        credit_note_id: creditNote?.id, credit_note_number: cnNumber,
        invoice_id: invoice.id, invoice_number: invoice.invoice_number,
        amount: amt, reason_code: reasonCode, refund_method: refundMethod,
      },
    })

    return { success: true, creditNote }
  } catch (err) {
    return { success: false, error: err.message || 'Could not create credit note' }
  }
}

// ---------------------------------------------------------------------
// PATIENT ACCOUNT STATEMENT
// ---------------------------------------------------------------------

// Compute a patient's account statement for a date range.
// Returns the totals + the ledger entries (invoices, payments, credit notes).
//
// This is a CLIENT-SIDE computation (no SQL). For very large patient
// histories, a server-side RPC would be more efficient — Phase 3+.
export function computePatientStatement({
  invoices, payments, creditNotes, deposits,
  patientId, periodFrom, periodTo,
}) {
  const fromMs = periodFrom ? new Date(periodFrom).getTime() : 0
  const toMs = periodTo ? new Date(periodTo + 'T23:59:59').getTime() : Date.now()

  // Filter to this patient + date range
  const patientInvoices = (invoices || []).filter(i =>
    i.patient_id === patientId &&
    new Date(i.created_at).getTime() >= fromMs &&
    new Date(i.created_at).getTime() <= toMs &&
    i.draft_status !== 'cancelled'
  )
  const patientPayments = (payments || []).filter(p =>
    p.patient_id === patientId &&
    new Date(p.created_at).getTime() >= fromMs &&
    new Date(p.created_at).getTime() <= toMs &&
    p.status !== 'reversed'
  )
  const patientCreditNotes = (creditNotes || []).filter(cn =>
    cn.original_invoice_id && (invoices || []).find(i => i.id === cn.original_invoice_id)?.patient_id === patientId &&
    new Date(cn.created_at).getTime() >= fromMs &&
    new Date(cn.created_at).getTime() <= toMs &&
    cn.status === 'posted'
  )

  // Opening balance = sum of all invoices BEFORE period_from minus all payments BEFORE period_from
  const openingInvoices = (invoices || []).filter(i =>
    i.patient_id === patientId &&
    new Date(i.created_at).getTime() < fromMs &&
    i.draft_status !== 'cancelled'
  ).reduce((s, i) => s + Number(i.grand_total || i.amount || 0), 0)
  const openingPayments = (payments || []).filter(p =>
    p.patient_id === patientId &&
    new Date(p.created_at).getTime() < fromMs &&
    p.status !== 'reversed'
  ).reduce((s, p) => s + Number(p.amount || 0), 0)
  const openingBalance = openingInvoices - openingPayments

  // Period totals
  const totalInvoiced = patientInvoices.reduce((s, i) => s + Number(i.grand_total || i.amount || 0), 0)
  const totalPaid = patientPayments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const totalRefunded = patientCreditNotes.reduce((s, cn) => s + (cn.refund_method === 'cash' || cn.refund_method === 'bank_transfer' ? Number(cn.amount || 0) : 0), 0)
  const totalAdjusted = patientCreditNotes.reduce((s, cn) => s + (cn.refund_method === 'none' || cn.refund_method === 'wallet' ? Number(cn.amount || 0) : 0), 0)

  // Closing balance = opening + invoiced - paid + refunded (cash refunds increase what patient is owed back)
  //                   - adjusted (credits that reduced the invoice balance without cash leaving)
  const closingBalance = openingBalance + totalInvoiced - totalPaid - totalAdjusted

  // Build a unified ledger sorted by date
  const ledger = [
    ...patientInvoices.map(i => ({
      date: i.created_at, type: 'invoice', number: i.invoice_number,
      description: `Invoice ${i.invoice_number} (${i.invoice_type || 'outpatient'})`,
      debit: Number(i.grand_total || i.amount || 0), credit: 0,
      ref: i,
    })),
    ...patientPayments.map(p => ({
      date: p.created_at, type: 'payment', number: p.reference_number || p.id.slice(0, 8),
      description: `Payment (${p.method})${p.reference_number ? ` ref ${p.reference_number}` : ''}`,
      debit: 0, credit: Number(p.amount || 0),
      ref: p,
    })),
    ...patientCreditNotes.map(cn => ({
      date: cn.created_at, type: 'credit_note', number: cn.credit_note_number,
      description: `Credit note (${cn.reason_code}) — ${cn.reason_text}`,
      debit: cn.refund_method === 'cash' || cn.refund_method === 'bank_transfer' ? Number(cn.amount || 0) : 0,
      credit: cn.refund_method === 'none' || cn.refund_method === 'wallet' ? Number(cn.amount || 0) : 0,
      ref: cn,
    })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date))

  return {
    periodFrom, periodTo,
    openingBalance,
    totalInvoiced, totalPaid, totalRefunded, totalAdjusted,
    closingBalance,
    invoiceCount: patientInvoices.length,
    paymentCount: patientPayments.length,
    creditNoteCount: patientCreditNotes.length,
    ledger,
  }
}

