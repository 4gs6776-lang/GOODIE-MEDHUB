import { useState, useMemo, useEffect } from 'react'
import { useOfflineTable } from '../lib/useOfflineTable'
import InvoiceViewer from './InvoiceViewer'
import CatalogPicker from './CatalogPicker'
import AppIcon from './icons'
import { writeAudit } from '../lib/audit'
import { useBillingCatalog, formatMoney } from '../lib/billingService'

const METHODS = ['Cash', 'POS', 'Bank Transfer', 'Card', 'HMO', 'Insurance', 'Other']

export default function CashierWorkspace({ patientId, patientName, hospital, profile, onClose }) {
  const { records: charges, addRecord: addCharge, updateRecord: updateCharge } = useOfflineTable('billable_charges', hospital?.id)
  const { addRecord: addInvoice } = useOfflineTable('invoices', hospital?.id)
  const { addRecord: addInvoiceItem } = useOfflineTable('invoice_items', hospital?.id)
const { records: patients, updateRecord: updatePatient } = useOfflineTable('patients', hospital?.id)
  const { addRecord: addInsuranceClaim } = useOfflineTable('insurance_claims', hospital?.id)
  // ---- Wallet hooks (patient wallet feature) ----
  // Used to auto-deduct from the patient's wallet balance at invoice
  // generation time. HMO patients don't use the wallet (per Q6 = a).
  const { records: wallets, addRecord: addWallet } = useOfflineTable('patient_wallets', hospital?.id)
  const { addRecord: addWalletTxn } = useOfflineTable('patient_wallet_transactions', hospital?.id)

  // ---- Billing catalog hooks (Phase 1) ----
  // Catalog-driven pricing replaces the old window.prompt() flow.
  // The cashier opens a CatalogPicker modal, picks a service, the
  // price resolves automatically based on the patient's HMO contract
  // (if any) or the hospital's default price list.
  const { catalog, priceLists, priceListItems, contracts, paymentMethods } = useBillingCatalog()
  const [showCatalogPicker, setShowCatalogPicker] = useState(false)

  const [selectedIds, setSelectedIds] = useState([])
  const [discount, setDiscount] = useState('')
  const [tax, setTax] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [amountPaid, setAmountPaid] = useState('')
  const [saving, setSaving] = useState(false)
  // The receipt of the invoice just generated — shown through the shared
  // InvoiceViewer (Batch 3 wiring: this component was previously dead code).
  const [receiptInvoice, setReceiptInvoice] = useState(null)

  // The patient list here only has {id, name}, so look up the full
  // record ourselves to get their HMO details for the split calc.
  const patientRecord = useMemo(() => patients.find(p => p.id === patientId) || null, [patients, patientId])
  const hmoProvider = patientRecord?.hmo_provider || null
  const hmoCoveragePercent = Math.min(100, Math.max(0, Number(patientRecord?.hmo_coverage_percent) || 0))
  const hasHmo = !!hmoProvider && hmoCoveragePercent > 0

  // ---- Patient's wallet (if any) -------------------------------------
  // HMO patients don't use the wallet — their bills go straight to the
  // HMO claim flow. Self-pay patients with a wallet get auto-deducted.
  const patientWallet = useMemo(() => {
    if (hasHmo) return null  // HMO patients bypass the wallet
    return wallets.find(w => w.patient_id === patientId) || null
  }, [wallets, patientId, hasHmo])

  const walletBalance = Number(patientWallet?.balance || 0)
  const canUseWallet = !!patientWallet && walletBalance > 0.001

  const pendingCharges = useMemo(() => {
    return charges.filter(c => c.patient_id === patientId && c.status === 'pending')
  }, [charges, patientId])

  // Auto-select all pending charges when they load
  useEffect(() => {
    setSelectedIds(pendingCharges.map(c => c.id))
  }, [pendingCharges])

  function toggleCharge(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  async function addCustomCharge() {
    // OLD behavior (kept as fallback for hospitals that haven't run
    // migration 034 yet): prompt() for name + price.
    if (!catalog || catalog.length === 0) {
      const name = window.prompt('Enter custom charge name (e.g. Consultation, Lab Test):')
      if (!name) return
      const priceStr = window.prompt('Enter price for this service (₦):', '0')
      const price = parseFloat(priceStr) || 0
      await addCharge({
        hospital_id: hospital.id, patient_id: patientId, patient_name: patientName,
        source_module: 'Manual', source_transaction_id: `MANUAL-${Date.now()}`,
        item_name: name, category: 'Manual', quantity: 1, unit_price: price, total: price,
        status: 'pending', created_by: profile?.id
      })
      writeAudit({
        hospitalId: hospital?.id, actor: profile,
        action: 'billing.custom_charge_added',
        entityType: 'billable_charge', entityId: null,
        patientId: patientId || null,
        summary: `Added custom charge "${name}" (₦${price.toFixed(2)}) for ${patientName || 'patient'}`,
        metadata: { patient_name: patientName, item_name: name, unit_price: price, quantity: 1, total: price, source_module: 'Manual' },
      })
      return
    }

    // NEW behavior: open the CatalogPicker. The picker resolves the
    // price automatically based on the patient's HMO contract (or the
    // hospital's default price list). The cashier can override the
    // price + quantity if needed.
    setShowCatalogPicker(true)
  }

  // Called when the cashier picks a service in the CatalogPicker and
  // clicks "Add Charge". Inserts a billable_charge row with the
  // resolved price + quantity + HMO split info.
  async function handleCatalogPick({ service, resolved, total, split }) {
    const qty = resolved.quantity || 1
    const unitPrice = resolved.price
    const patientRecord = patients.find(p => p.id === patientId) || null

    // Use the service's category as the billable_charge category. Map
    // catalog categories to the existing CashierWorkspace category names
    // so the existing InvoiceViewer "Medications" grouping still works
    // (DRUG_CATEGORIES = 'Drug', 'Pharmacy', 'Medication', 'Medications').
    const categoryMap = {
      'consultation': 'Consultation',
      'lab':          'Lab',
      'procedure':    'Procedure',
      'drug':         'Drug',          // matches DRUG_CATEGORIES — grouped as "Medications" on printed bill
      'bed':          'Bed',
      'service':      'Service',
      'anc_package':  'ANC',
      'registration': 'Registration',
      'other':        'Manual',
    }
    const chargeCategory = categoryMap[service.category] || 'Manual'

    await addCharge({
      hospital_id: hospital.id,
      patient_id: patientId,
      patient_name: patientName,
      source_module: 'Catalog',
      source_transaction_id: `CAT-${service.code}-${Date.now()}`,
      item_name: service.name,
      category: chargeCategory,
      quantity: qty,
      unit_price: unitPrice,
      total: total,
      status: 'pending',
      created_by: profile?.id,
      // Phase 2 will store these on the billable_charges row when we
      // add the catalog_code / price_list_id columns. For now they're
      // captured in the audit trail.
      // catalog_code: service.code,
      // price_list_id: resolved.priceListId,
    })

    writeAudit({
      hospitalId: hospital?.id, actor: profile,
      action: 'billing.catalog_charge_added',
      entityType: 'billable_charge', entityId: null,
      patientId: patientId || null,
      summary: `Added catalog charge "${service.name}" (${service.code}) × ${qty} = ${formatMoney(total)} for ${patientName || 'patient'}` +
        (split.hmoAmount > 0 ? ` — HMO ${formatMoney(split.hmoAmount)}, patient ${formatMoney(split.patientAmount)}` : ''),
      metadata: {
        patient_name: patientName,
        catalog_code: service.code,
        catalog_id: service.id,
        category: chargeCategory,
        item_name: service.name,
        unit_price: unitPrice,
        quantity: qty,
        total,
        price_list_id: resolved.priceListId,
        contract_id: resolved.contractId,
        coverage_percent: resolved.coveragePercent,
        hmo_amount: split.hmoAmount,
        patient_amount: split.patientAmount,
        source_module: 'Catalog',
      },
    })

    setShowCatalogPicker(false)
  }

  const selectedCharges = pendingCharges.filter(c => selectedIds.includes(c.id))
  const subtotal = selectedCharges.reduce((s, c) => s + Number(c.total || 0), 0)
  const discountAmt = Number(discount) || 0
  const taxAmt = Number(tax) || 0
  const grandTotal = Math.max(0, subtotal - discountAmt + taxAmt)

  // HMO split — the patient only pays their share at the counter; the
  // HMO's share becomes a receivable tracked in Insurance/HMO Claims.
  const hmoAmount = hasHmo ? Math.round(grandTotal * (hmoCoveragePercent / 100) * 100) / 100 : 0
  const patientAmount = Math.max(0, grandTotal - hmoAmount)
  const amountOwedByPatient = hasHmo ? patientAmount : grandTotal

  const formatMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  async function handleGenerateInvoice() {
    if (selectedCharges.length === 0) return alert('No charges selected.')
    setSaving(true)
    try {
      const pAmt = Number(amountPaid) || 0

      // ---- Wallet auto-deduction (per Q3 = a, Q5 = a, Q6 = a) ----------
      // If the patient has a wallet balance, deduct from it FIRST.
      // The remainder is the cashier-collected amount (pAmt).
      // Total paid = wallet deduction + cashier payment.
      // Balance due = amountOwedByPatient - totalPaid.
      // Wallet can never go negative — we cap the deduction at the
      // available balance.
      let walletDeduction = 0
      if (canUseWallet) {
        walletDeduction = Math.min(walletBalance, amountOwedByPatient)
      }
      const totalPaid = walletDeduction + pAmt
      const bal = Math.max(0, amountOwedByPatient - totalPaid)
      const status = totalPaid >= amountOwedByPatient - 0.001 ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid')

      const newInv = await addInvoice({
  hospital_id: hospital.id, patient_id: patientId, patient_name: patientName,
  invoice_number: `INV-${Date.now().toString().slice(-8)}`, subtotal,
  amount: grandTotal,
  discount: discountAmt, tax: taxAmt, grand_total: grandTotal,
  hmo_provider: hasHmo ? hmoProvider : null,
  hmo_coverage_percent: hasHmo ? hmoCoveragePercent : null,
  hmo_amount: hasHmo ? hmoAmount : 0,
  patient_amount: amountOwedByPatient,
  amount_paid: totalPaid,
  wallet_deduction: walletDeduction,         // NEW: how much came from the wallet
  wallet_id: walletDeduction > 0 ? patientWallet.id : null,  // NEW: link to the wallet
  balance: bal,
  payment_method: walletDeduction > 0 ? (pAmt > 0 ? `${paymentMethod} + Wallet` : 'Wallet') : paymentMethod,
  status, created_by: profile?.id
})


      for (const charge of selectedCharges) {
        await addInvoiceItem({
          hospital_id: hospital.id, invoice_id: newInv.id, item_name: charge.item_name,
          quantity: charge.quantity, unit_price: charge.unit_price, total: charge.total,
          // NEW: propagate the charge's source module + category so the
          // printed bill can group drug items into a single "Medications"
          // line (per the bill-printing patch). Items without these fields
          // stay listed individually.
          source_module: charge.source_module || null,
          category: charge.category || null,
        })
        await updateCharge(charge.id, { status: 'invoiced' })
      }

      // ---- Record the wallet charge transaction (if any) -------------
      // Append-only ledger entry. The trigger on patient_wallet_transactions
      // will update the wallets.balance column automatically.
      if (walletDeduction > 0 && patientWallet) {
        const newWalletBalance = walletBalance - walletDeduction
        await addWalletTxn({
          hospital_id: hospital.id,
          patient_id: patientId,
          wallet_id: patientWallet.id,
          type: 'charge',
          amount: -walletDeduction,            // negative = money leaving the wallet
          balance_after: newWalletBalance,
          method: 'Wallet',
          invoice_id: newInv.id,
          performed_by: profile?.id,
          performed_by_name: profile?.full_name || null,
          notes: `Auto-deducted for invoice ${newInv.invoice_number}`,
        })
        writeAudit({
          hospitalId: hospital?.id, actor: profile,
          action: 'wallet.charge',
          entityType: 'invoice', entityId: newInv.id,
          patientId: patientId,
          summary: `Auto-charged ${formatMoney(walletDeduction)} from ${patientName}'s wallet for invoice ${newInv.invoice_number}`,
          metadata: {
            invoice_id: newInv.id, invoice_number: newInv.invoice_number,
            wallet_id: patientWallet.id,
            wallet_deduction: walletDeduction,
            wallet_balance_before: walletBalance,
            wallet_balance_after: newWalletBalance,
          },
        })
      }

      // Auto-file the HMO's portion as a claim, so it shows up in
      // Insurance/HMO Claims without anyone re-typing it by hand.
      if (hasHmo && hmoAmount > 0) {
        await addInsuranceClaim({
          hospital_id: hospital.id,
          patient_id: patientId,
          patient_name: patientName,
          provider: hmoProvider,
          policy_number: patientRecord?.hmo_number || null,
          invoice_id: newInv.id,
          amount: hmoAmount,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          created_by: profile?.id,
        })
        writeAudit({
          hospitalId: hospital?.id, actor: profile,
          action: 'insurance.claim_auto_filed',
          entityType: 'invoice', entityId: newInv.id,
          patientId: patientId || null,
          summary: `Auto-filed ${hmoProvider} claim for ₦${hmoAmount.toFixed(2)} on invoice ${newInv.invoice_number} (${patientName})`,
          metadata: {
            invoice_id: newInv.id, invoice_number: newInv.invoice_number,
            patient_name: patientName, provider: hmoProvider,
            policy_number: patientRecord?.hmo_number || null,
            coverage_percent: hmoCoveragePercent, amount: hmoAmount,
          },
        })
      }

       // Billing complete — move patient to discharged in the queue
      if (patientId) {
        await updatePatient(patientId, { queue_status: 'discharged', queue_updated_at: new Date().toISOString() })
      }

      // Audit trail — invoice generated.
      writeAudit({
        hospitalId: hospital?.id, actor: profile,
        action: 'billing.invoice_generated',
        entityType: 'invoice', entityId: newInv.id,
        patientId: patientId || null,
        summary: `Generated invoice ${newInv.invoice_number} for ${patientName} — ₦${grandTotal.toFixed(2)} (${status})`,
        metadata: {
          invoice_id: newInv.id, invoice_number: newInv.invoice_number,
          patient_name: patientName,
          subtotal, discount: discountAmt, tax: taxAmt, grand_total: grandTotal,
          hmo_provider: hasHmo ? hmoProvider : null,
          hmo_amount: hasHmo ? hmoAmount : 0,
          patient_amount: amountOwedByPatient,
          amount_paid: pAmt, balance: bal, payment_method: paymentMethod,
          status, charge_count: selectedCharges.length,
        },
      })

      // Show the receipt (InvoiceViewer) instead of a browser alert —
      // the cashier can print it or record another payment immediately.
      setReceiptInvoice(newInv)

    } catch (err) {
      alert(err.message || 'Failed to generate invoice')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card dash-modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, flexShrink: 0 }}>
          <div>
            <div className="dash-modal-title" style={{ paddingBottom: 0 }}>Billing Workspace</div>
            <div style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 700, marginTop: 2 }}>{patientName}</div>
          </div>
          <button className="dash-icon-btn" onClick={onClose} aria-label="Close billing workspace"><AppIcon name="close" size={18} /></button>
        </div>

        {/* ---- Wallet balance banner (if patient has a wallet) -------- */}
        {canUseWallet && (
          <div style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(0,199,199,0.08)', border: '1px solid var(--teal-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: 12.5, color: 'var(--ivory)' }}>
              <strong style={{ color: 'var(--teal)' }}>Wallet balance: {formatMoney(walletBalance)}</strong>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                Will auto-deduct up to {formatMoney(Math.min(walletBalance, amountOwedByPatient))} from this invoice.
                {walletBalance >= amountOwedByPatient ? ' Invoice will be fully covered.' : ` Remaining ${formatMoney(amountOwedByPatient - walletBalance)} will be the balance due.`}
              </div>
            </div>
          </div>
        )}
        {hasHmo && (
          <div style={{
            marginBottom: 12, padding: '8px 12px', borderRadius: 8,
            background: 'rgba(118,87,232,0.06)', border: '1px solid rgba(118,87,232,0.25)',
            fontSize: 11.5, color: 'var(--muted)',
          }}>
            <strong style={{ color: 'var(--violet)' }}>HMO patient:</strong> Wallet is bypassed. The HMO covers {hmoCoveragePercent}% ({formatMoney(hmoAmount)}); patient pays {formatMoney(amountOwedByPatient)} directly.
          </div>
        )}

        <div className="dash-modal-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Automatic Charges</div>
            <button className="btn btn-ghost" style={{ width: 'auto', fontSize: 11.5, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={addCustomCharge}>
              <AppIcon name="plus" size={14} /> Add Charge from Catalog
            </button>
          </div>

          {pendingCharges.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)', fontSize: 12.5 }}>No pending charges for this patient.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendingCharges.map(c => {
                const isSelected = selectedIds.includes(c.id)
                return (
                  <div key={c.id} className={`billing-charge-row ${isSelected ? 'selected' : ''}`} onClick={() => toggleCharge(c.id)} style={{ cursor: 'pointer' }}>
                    <div className="billing-charge-check">{isSelected && <AppIcon name="check" size={12} strokeWidth={3} />}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{c.item_name} (x{c.quantity})</div>
                      <div style={{ marginTop: 4 }}>
                        <span className="billing-source-tag">{c.source_module}</span>
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>{formatMoney(c.total)}</div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--line-soft)' }}>
            <div className="dash-field-grid" style={{ margin: '0 0 16px' }}>
              <div className="field">
                <label>Discount (₦)</label>
                <input type="number" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="field">
                <label>Tax / VAT (₦)</label>
                <input type="number" value={tax} onChange={e => setTax(e.target.value)} placeholder="0.00" />
              </div>
            </div>

            <div className="billing-summary-row"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
            <div className="billing-summary-row" style={{ color: 'var(--danger)' }}><span>Discount</span><span>- {formatMoney(discountAmt)}</span></div>
            <div className="billing-summary-row" style={{ color: 'var(--gold)' }}><span>Tax / VAT</span><span>+ {formatMoney(taxAmt)}</span></div>
            <div className="billing-summary-row grand" style={{ marginBottom: hasHmo ? 12 : 16 }}>
              <span>Total Bill</span><span style={{ color: 'var(--teal)' }}>{formatMoney(grandTotal)}</span>
            </div>

            {hasHmo && (
              <div className="billing-hmo-box" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  {hmoProvider} Coverage ({hmoCoveragePercent}%)
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: 'var(--muted)' }}>HMO Covers</span>
                  <span style={{ fontWeight: 700, color: 'var(--teal)' }}>{formatMoney(hmoAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800 }}>
                  <span>Patient Pays</span>
                  <span style={{ color: 'var(--gold)' }}>{formatMoney(patientAmount)}</span>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 6 }}>
                  The HMO's share will be auto-filed as a claim in Insurance / HMO Claims.
                </div>
              </div>
            )}

            <div className="field">
              <label>Payment Method</label>
              <div className="billing-method-grid">
                {METHODS.map(m => (
                  <button
                    key={m}
                    type="button"
                    className={`billing-method-chip ${paymentMethod === m ? 'active' : ''}`}
                    onClick={() => setPaymentMethod(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>{hasHmo ? 'Amount Paid by Patient (₦)' : 'Amount Paid (₦)'}</label>
              <input
                type="number"
                value={amountPaid}
                onChange={e => setAmountPaid(e.target.value)}
                placeholder={amountOwedByPatient.toFixed(2)}
                style={{ fontSize: 16, fontWeight: 700 }}
              />
            </div>
          </div>
        </div>

        <div className="dash-modal-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleGenerateInvoice} disabled={saving || selectedCharges.length === 0}>
            {saving ? 'Generating…' : 'Generate Invoice'}
          </button>
        </div>
      </div>

      {receiptInvoice && (
        <InvoiceViewer
          invoice={receiptInvoice}
          hospital={hospital}
          profile={profile}
          onClose={() => { setReceiptInvoice(null); onClose() }}
        />
      )}

      {/* ---- CatalogPicker modal ----
          Opens when the cashier clicks "Add Custom Charge". They pick a
          service from the catalog; the price resolves automatically based
          on the patient's HMO contract (or the default price list). */}
      {showCatalogPicker && (
        <CatalogPicker
          catalog={catalog}
          priceLists={priceLists}
          priceListItems={priceListItems}
          contracts={contracts}
          patient={patients.find(p => p.id === patientId) || null}
          onPick={handleCatalogPick}
          onClose={() => setShowCatalogPicker(false)}
        />
      )}
    </div>
  )
}
