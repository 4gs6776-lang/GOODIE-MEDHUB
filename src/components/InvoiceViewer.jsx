import { useState } from 'react'
import { useOfflineTable } from '../lib/useOfflineTable'

const METHODS = ['Cash', 'POS', 'Bank Transfer', 'Card', 'HMO', 'Insurance', 'Other']

function CloseIcon({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
}
function PrintIcon({ size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="1" /><path d="M6 17v4h12v-4" /></svg>
}

export default function InvoiceViewer({ invoice, onClose, hospital, profile }) {
  const { updateRecord: updateInvoice } = useOfflineTable('invoices', hospital?.id)
  const { records: allItems } = useOfflineTable('invoice_items', hospital?.id)
  const { records: allPayments, addRecord: addPayment } = useOfflineTable('payments', hospital?.id)

  const [showPay, setShowPay] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('Cash')
  const [saving, setSaving] = useState(false)

  const invItems = allItems.filter(i => i.invoice_id === invoice.id)
  const invPayments = allPayments.filter(p => p.invoice_id === invoice.id)

  const grandTotal = Number(invoice.grand_total || invoice.amount || 0)
  const totalPaid = Number(invoice.amount_paid || 0)
  const balance = Number(invoice.balance || (grandTotal - totalPaid))

  const formatMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  async function handleSavePayment(e) {
    e.preventDefault()
    const amt = Number(payAmount)
    if (isNaN(amt) || amt <= 0) return alert('Enter valid amount')
    setSaving(true)
    try {
      await addPayment({
        hospital_id: hospital.id, invoice_id: invoice.id, patient_id: invoice.patient_id,
        patient_name: invoice.patient_name, amount: amt, method: payMethod,
        received_by: profile?.id, reference_number: `REF-${Date.now().toString().slice(-6)}`
      })
      const newPaid = totalPaid + amt
      const newBal = grandTotal - newPaid
      await updateInvoice(invoice.id, {
        amount_paid: newPaid, balance: newBal,
        payment_method: payMethod, status: newBal <= 0 ? 'paid' : 'partial'
      })
      setPayAmount(''); setShowPay(false)
      onClose() // Close to refresh table
    } catch (err) { alert(err.message) } finally { setSaving(false) }
  }

  function handlePrint() {
    const itemsRows = invItems.map(it => `<tr><td>${it.item_name}</td><td>${it.quantity}</td><td>₦${Number(it.unit_price||0).toFixed(2)}</td><td>₦${Number(it.total||0).toFixed(2)}</td></tr>`).join('')
    const html = `
      <html><head><title>Receipt ${invoice.invoice_number}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #111; max-width: 800px; margin: auto; }
        .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 30px; }
        .h-name { font-size: 24px; font-weight: bold; text-transform: uppercase; }
        .h-meta { font-size: 14px; color: #555; margin-top: 5px; }
        .grid { display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 14px; }
        .box { background: #f8f9fa; padding: 15px; border-radius: 8px; width: 48%; }
        .box h3 { margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #888; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background: #f8f9fa; font-weight: bold; }
        .totals { margin-left: auto; width: 300px; font-size: 14px; }
        .totals div { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .totals .grand { font-weight: bold; font-size: 18px; border-bottom: 2px solid #000; }
        .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #888; }
        .sign { margin-top: 60px; border-top: 1px solid #000; width: 200px; text-align: center; font-size: 12px; padding-top: 5px; }
      </style></head><body>
        <div class="header">
          <div class="h-name">${hospital?.name || 'Hospital'}</div>
          <div class="h-meta">123 Health Avenue, City, State</div>
          <div class="h-meta">Tel: +234 800 000 0000</div>
        </div>
        <div class="grid">
          <div class="box">
            <h3>Patient Details</h3>
            <div><strong>Name:</strong> ${invoice.patient_name}</div>
            <div><strong>ID:</strong> ${invoice.patient_id || '—'}</div>
          </div>
          <div class="box">
            <h3>Payment Details</h3>
            <div><strong>Receipt #:</strong> ${invoice.invoice_number || invoice.id.slice(0,8)}</div>
            <div><strong>Date:</strong> ${new Date(invoice.created_at).toLocaleString()}</div>
            <div><strong>Method:</strong> ${invoice.payment_method || 'N/A'}</div>
          </div>
        </div>
        <table>
          <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
          <tbody>${itemsRows || '<tr><td colspan="4">No items recorded</td></tr>'}</tbody>
        </table>
        <div class="totals">
          <div><span>Subtotal</span> <span>₦${Number(invoice.subtotal||grandTotal).toFixed(2)}</span></div>
          <div><span>Amount Paid</span> <span>₦${totalPaid.toFixed(2)}</span></div>
          <div class="grand"><span>Balance Due</span> <span>₦${balance.toFixed(2)}</span></div>
        </div>
        <div class="sign">Authorized Signature</div>
        <div class="footer">Thank you for choosing ${hospital?.name || 'us'}. This is a computer generated receipt.</div>
      </body></html>`
    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 500)
  }

  return (
    <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card dash-modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, flexShrink: 0 }}>
          <div>
            <div className="dash-modal-title" style={{ paddingBottom: 0 }}>Invoice Details</div>
            <div style={{ fontSize: 12.5, color: 'var(--blue)', fontWeight: 700, marginTop: 2 }}>{invoice.invoice_number || invoice.id.slice(0, 8)}</div>
          </div>
          <button className="dash-icon-btn" onClick={onClose}><CloseIcon /></button>
        </div>

        <div className="dash-modal-body">
          <div className="dash-patient-name" style={{ marginBottom: 18 }}>
            <span>{String(invoice.patient_name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{invoice.patient_name}</div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>Patient</div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Items Billed</div>
            {invItems.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No specific items recorded (likely a quick charge).</div>
            ) : (
              invItems.map(it => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                  <span>{it.item_name} (x{it.quantity})</span>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{formatMoney(it.total)}</span>
                </div>
              ))
            )}
          </div>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line-soft)' }}>
            <div className="billing-summary-row"><span>Grand Total</span><span style={{ fontWeight: 700, color: 'var(--ivory)' }}>{formatMoney(grandTotal)}</span></div>
            <div className="billing-summary-row" style={{ color: 'var(--teal)' }}><span>Amount Paid</span><span>{formatMoney(totalPaid)}</span></div>
            <div className="billing-summary-row grand" style={{ color: balance > 0 ? 'var(--danger)' : 'var(--teal)' }}>
              <span>Balance Due</span><span>{formatMoney(balance)}</span>
            </div>
          </div>

          {invPayments.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Payment History</div>
              {invPayments.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
                  <span>{new Date(p.created_at).toLocaleString()} · {p.method}</span>
                  <span style={{ color: 'var(--ivory)', fontWeight: 700 }}>{formatMoney(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dash-modal-actions">
          <button className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }} onClick={handlePrint}>
            <PrintIcon /> Print Receipt
          </button>
          {balance > 0 && <button className="btn btn-primary" onClick={() => setShowPay(true)}>Record Payment</button>}
        </div>
      </div>

      {showPay && (
        <div className="dash-modal-backdrop" style={{ zIndex: 110 }} onClick={e => { if (e.target === e.currentTarget) setShowPay(false) }}>
          <div className="card dash-modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="dash-modal-title">Record Payment</div>
            <div className="dash-modal-body">
              <form id="record-payment-form" onSubmit={handleSavePayment}>
                <div className="field">
                  <label>Amount (₦)</label>
                  <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={`Max: ${balance.toFixed(2)}`} autoFocus required />
                </div>
                <div className="field">
                  <label>Method</label>
                  <select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                    {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </form>
            </div>
            <div className="dash-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowPay(false)}>Cancel</button>
              <button type="submit" form="record-payment-form" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Payment'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
