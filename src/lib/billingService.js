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
