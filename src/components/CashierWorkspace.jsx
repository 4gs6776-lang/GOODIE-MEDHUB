import { useState, useMemo, useEffect } from 'react'
import { useOfflineTable } from '../lib/useOfflineTable'

const METHODS = ['Cash', 'POS', 'Bank Transfer', 'Card', 'HMO', 'Insurance', 'Other']

export default function CashierWorkspace({ patientId, patientName, hospital, profile, onClose }) {
  const { records: charges, addRecord: addCharge, updateRecord: updateCharge } = useOfflineTable('billable_charges', hospital?.id)
  const { addRecord: addInvoice } = useOfflineTable('invoices', hospital?.id)
  const { addRecord: addInvoiceItem } = useOfflineTable('invoice_items', hospital?.id)

  const [selectedIds, setSelectedIds] = useState([])
  const [discount, setDiscount] = useState('')
  const [tax, setTax] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [amountPaid, setAmountPaid] = useState('')
  const [saving, setSaving] = useState(false)

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

  async function handleGenerateInvoice() {
    if (selectedCharges.length === 0) return alert('No charges selected.')
    setSaving(true)
    try {
      const pAmt = Number(amountPaid) || 0
      const bal = grandTotal - pAmt
      const status = pAmt >= grandTotal ? 'paid' : (pAmt > 0 ? 'partial' : 'unpaid')
      
      const newInv = await addInvoice({
        hospital_id: hospital.id, patient_id: patientId, patient_name: patientName,
        invoice_number: `INV-${Date.now().toString().slice(-8)}`, subtotal,
        discount: discountAmt, tax: taxAmt, grand_total: grandTotal,
        amount_paid: pAmt, balance: bal, payment_method: paymentMethod, status, created_by: profile?.id
      })

      for (const charge of selectedCharges) {
        await addInvoiceItem({
          hospital_id: hospital.id, invoice_id: newInv.id, item_name: charge.item_name,
          quantity: charge.quantity, unit_price: charge.unit_price, total: charge.total
        })
        await updateCharge(charge.id, { status: 'invoiced' })
      }

      alert('Invoice generated successfully! The patient has been billed.')
      onClose()
    } catch (err) {
      alert(err.message || 'Failed to generate invoice')
    } finally {
      setSaving(false)
    }
  }

  const formatMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }} onClick={e => { if(e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ width: '100%', maxWidth: 700, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>Billing Workspace</div>
            <div style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 700 }}>{patientName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Automatic Charges</div>
            <button className="btn btn-ghost" style={{ width: 'auto', fontSize: 12, padding: '5px 10px', border: '1px solid var(--line)' }} onClick={addCustomCharge}>
              + Add Custom Charge
            </button>
          </div>

          {pendingCharges.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)', fontSize: 13 }}>No pending charges for this patient.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendingCharges.map(c => (
                <div key={c.id} style={{ background: 'var(--bg-elevated)', padding: 12, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, border: selectedIds.includes(c.id) ? '1px solid var(--teal)' : '1px solid transparent' }}>
                  <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggleCharge(c.id)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{c.item_name} (x{c.quantity})</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: 'var(--bg-card)', color: 'var(--muted)', textTransform: 'uppercase' }}>
                        {c.source_module}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--teal)' }}>{formatMoney(c.total)}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--line-soft)' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Discount (₦)</label>
                <input type="number" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0.00" style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px', color: 'var(--text)' }} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Tax / VAT (₦)</label>
                <input type="number" value={tax} onChange={e => setTax(e.target.value)} placeholder="0.00" style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px', color: 'var(--text)' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--danger)', marginBottom: 4 }}><span>Discount</span><span>- {formatMoney(discountAmt)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--gold)', marginBottom: 12 }}><span>Tax / VAT</span><span>+ {formatMoney(taxAmt)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, borderTop: '1px solid var(--line-soft)', paddingTop: 8, marginBottom: 16 }}>
              <span>Grand Total</span><span style={{ color: 'var(--teal)' }}>{formatMoney(grandTotal)}</span>
            </div>

            <div className="field"><label>Payment Method</label><select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px', color: 'var(--text)' }}>{METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
            <div className="field"><label>Amount Paid (₦)</label><input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} placeholder={grandTotal.toFixed(2)} style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px', color: 'var(--text)', fontSize: 16, fontWeight: 700 }} /></div>
          </div>
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-ghost" style={{ width: 'auto', padding: '0 20px' }} onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" style={{ width: 'auto', padding: '0 24px' }} onClick={handleGenerateInvoice} disabled={saving || selectedCharges.length === 0}>
            {saving ? 'Generating…' : 'Generate Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}
