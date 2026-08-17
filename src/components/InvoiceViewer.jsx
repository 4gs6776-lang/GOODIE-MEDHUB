import { useState } from 'react'
import { useOfflineTable } from '../lib/useOfflineTable'

const METHODS = ['Cash', 'POS', 'Bank Transfer', 'Card', 'HMO', 'Insurance', 'Other']

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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }} onClick={e => { if(e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ width: '100%', maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>Invoice Details</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
            <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Patient</div><div style={{ fontWeight: 700, fontSize: 16 }}>{invoice.patient_name}</div></div>
            <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, color: 'var(--muted)' }}>Invoice #</div><div style={{ fontWeight: 700, color: 'var(--blue)' }}>{invoice.invoice_number || invoice.id.slice(0,8)}</div></div>
          </div>

          <div style={{ borderTop: '1px solid var(--line-soft)', marginTop: 10, paddingTop: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Items Billed</div>
            {invItems.length === 0 ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>No specific items recorded (likely a quick charge).</div> : (
              invItems.map(it => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                  <span>{it.item_name} (x{it.quantity})</span>
                  <span style={{ fontWeight: 700 }}>₦{Number(it.total||0).toFixed(2)}</span>
                </div>
              ))
            )}
          </div>

          <div style={{ marginTop: 20, paddingTop: 15, borderTop: '1px solid var(--line-soft)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}><span>Grand Total</span><span style={{ fontWeight: 700 }}>₦{grandTotal.toFixed(2)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--teal)', marginBottom: 4 }}><span>Amount Paid</span><span>₦{totalPaid.toFixed(2)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: balance > 0 ? 'var(--danger)' : 'var(--teal)' }}><span>Balance Due</span><span>₦{balance.toFixed(2)}</span></div>
          </div>

          {invPayments.length > 0 && (
            <div style={{ marginTop: 20, fontSize: 12, color: 'var(--muted)' }}>
              <div style={{ marginBottom: 6, fontWeight: 700 }}>Payment History</div>
              {invPayments.map(p => <div key={p.id}>{new Date(p.created_at).toLocaleString()} — ₦{Number(p.amount).toFixed(2)} via {p.method}</div>)}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--line-soft)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" style={{ width: 'auto', padding: '0 16px' }} onClick={handlePrint}>🖨️ Print Receipt</button>
          {balance > 0 && <button className="btn btn-primary" style={{ width: 'auto', padding: '0 20px' }} onClick={() => setShowPay(true)}>Record Payment</button>}
        </div>
      </div>

      {showPay && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: 20 }} onClick={e => { if(e.target === e.currentTarget) setShowPay(false) }}>
          <div className="card" style={{ width: '100%', maxWidth: 400, padding: 24 }}>
            <h3 style={{ marginTop: 0 }}>Record Payment</h3>
            <form onSubmit={handleSavePayment}>
              <div className="field"><label>Amount (₦)</label><input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={`Max: ${balance.toFixed(2)}`} autoFocus required /></div>
              <div className="field"><label>Method</label><select value={payMethod} onChange={e => setPayMethod(e.target.value)} style={{ width: '100%' }}>{METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={() => setShowPay(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={saving}>{saving ? 'Saving...' : 'Save Payment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}