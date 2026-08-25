import { useState, useMemo, useEffect } from 'react'
import { useOfflineTable } from '../lib/useOfflineTable'

const METHODS = ['Cash', 'POS', 'Bank Transfer', 'Card', 'HMO', 'Insurance', 'Other']

function CheckIcon({ size = 12 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
}
function CloseIcon({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
}
function PlusIcon({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
}

export default function CashierWorkspace({ patientId, patientName, hospital, profile, onClose }) {
  const { records: charges, addRecord: addCharge, updateRecord: updateCharge } = useOfflineTable('billable_charges', hospital?.id)
  const { addRecord: addInvoice } = useOfflineTable('invoices', hospital?.id)
  const { addRecord: addInvoiceItem } = useOfflineTable('invoice_items', hospital?.id)
  const { records: patients } = useOfflineTable('patients', hospital?.id)
  const { addRecord: addInsuranceClaim } = useOfflineTable('insurance_claims', hospital?.id)

  const [selectedIds, setSelectedIds] = useState([])
  const [discount, setDiscount] = useState('')
  const [tax, setTax] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [amountPaid, setAmountPaid] = useState('')
  const [saving, setSaving] = useState(false)

  // The patient list here only has {id, name}, so look up the full
  // record ourselves to get their HMO details for the split calc.
  const patientRecord = useMemo(() => patients.find(p => p.id === patientId) || null, [patients, patientId])
  const hmoProvider = patientRecord?.hmo_provider || null
  const hmoCoveragePercent = Math.min(100, Math.max(0, Number(patientRecord?.hmo_coverage_percent) || 0))
  const hasHmo = !!hmoProvider && hmoCoveragePercent > 0

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
      const bal = amountOwedByPatient - pAmt
      const status = pAmt >= amountOwedByPatient ? 'paid' : (pAmt > 0 ? 'partial' : 'unpaid')

      const newInv = await addInvoice({
        hospital_id: hospital.id, patient_id: patientId, patient_name: patientName,
        invoice_number: `INV-${Date.now().toString().slice(-8)}`, subtotal,
        discount: discountAmt, tax: taxAmt, grand_total: grandTotal,
        hmo_provider: hasHmo ? hmoProvider : null,
        hmo_coverage_percent: hasHmo ? hmoCoveragePercent : null,
        hmo_amount: hasHmo ? hmoAmount : 0,
        patient_amount: amountOwedByPatient,
        amount_paid: pAmt, balance: bal, payment_method: paymentMethod, status, created_by: profile?.id
      })

      for (const charge of selectedCharges) {
        await addInvoiceItem({
          hospital_id: hospital.id, invoice_id: newInv.id, item_name: charge.item_name,
          quantity: charge.quantity, unit_price: charge.unit_price, total: charge.total
        })
        await updateCharge(charge.id, { status: 'invoiced' })
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
      }

      alert(hasHmo
        ? `Invoice generated! Patient pays ${formatMoney(amountOwedByPatient)} — ${hmoProvider} billed ${formatMoney(hmoAmount)} (claim auto-filed).`
        : 'Invoice generated successfully! The patient has been billed.')
      onClose()
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
          <button className="dash-icon-btn" onClick={onClose}><CloseIcon /></button>
        </div>

        <div className="dash-modal-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Automatic Charges</div>
            <button className="btn btn-ghost" style={{ width: 'auto', fontSize: 11.5, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={addCustomCharge}>
              <PlusIcon /> Add Custom Charge
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
                    <div className="billing-charge-check">{isSelected && <CheckIcon />}</div>
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
    </div>
  )
}
