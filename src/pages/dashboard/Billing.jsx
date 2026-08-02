import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'

export default function Billing(){
  const { profile, hospital } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState(null)

  const [patientName, setPatientName] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState('unpaid')
  const [saving, setSaving] = useState(false)

  async function loadInvoices(){
    setLoading(true)
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setInvoices(data || [])
    setLoading(false)
  }

  useEffect(() => { loadInvoices() }, [])

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleAdd(e){
    e.preventDefault()
    if (!patientName || !amount) return
    if (!hospital || !profile) {
      showToast('Still loading your account — try again in a moment')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('invoices').insert({
        hospital_id: hospital.id,
        patient_name: patientName,
        description,
        amount: parseFloat(amount),
        status,
        created_by: profile.id,
      })
      if (error) throw error
      setShowModal(false)
      setPatientName(''); setDescription(''); setAmount(''); setStatus('unpaid')
      showToast('Invoice added')
      loadInvoices()
    } catch (err) {
      showToast(err.message || 'Could not save invoice')
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(invoice){
    const newStatus = invoice.status === 'paid' ? 'unpaid' : 'paid'
    const { error } = await supabase.from('invoices').update({ status: newStatus }).eq('id', invoice.id)
    if (!error) {
      showToast(`Marked ${newStatus}`)
      loadInvoices()
    }
  }

  async function handleDelete(invoice){
    if (!confirm(`Delete this invoice for ${invoice.patient_name}?`)) return
    const { error } = await supabase.from('invoices').delete().eq('id', invoice.id)
    if (!error) {
      showToast('Invoice deleted')
      loadInvoices()
    }
  }

  const totalUnpaid = invoices.filter(i => i.status === 'unpaid').reduce((sum, i) => sum + Number(i.amount), 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.amount), 0)

  function formatMoney(n){
    return '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })
  }

  return (
    <>
      <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 20 }}>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(201,169,97,0.14)', color: 'var(--gold)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Outstanding</div>
            <div className="dash-stat-value">{formatMoney(totalUnpaid)}</div>
            <div className="dash-stat-delta" style={{ color: 'var(--gold)' }}>{invoices.filter(i => i.status === 'unpaid').length} unpaid invoice(s)</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Collected</div>
            <div className="dash-stat-value">{formatMoney(totalPaid)}</div>
            <div className="dash-stat-delta">{invoices.filter(i => i.status === 'paid').length} paid invoice(s)</div>
          </div>
        </div>
      </div>

      <div className="dash-panel">
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Invoices</div>
            <div className="dash-panel-sub">Only {hospital?.name || 'your hospital'} can see this list</div>
          </div>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New Invoice</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
        ) : invoices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No invoices yet. Add your first one above.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Patient', 'Description', 'Amount', 'Status', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '0 12px 12px', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                  <td style={{ padding: 12, fontWeight: 700 }}>{inv.patient_name}</td>
                  <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5 }}>{inv.description || '—'}</td>
                  <td style={{ padding: 12, fontFamily: 'var(--font-mono)', fontSize: 13 }}>{formatMoney(inv.amount)}</td>
                  <td style={{ padding: 12 }}>
                    <span
                      onClick={() => toggleStatus(inv)}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                        background: inv.status === 'paid' ? 'var(--teal-soft)' : 'rgba(201,169,97,0.14)',
                        color: inv.status === 'paid' ? 'var(--teal)' : 'var(--gold)',
                      }}
                      title="Tap to toggle"
                    >
                      {inv.status === 'paid' ? 'Paid' : 'Unpaid'}
                    </span>
                  </td>
                  <td style={{ padding: 12 }}>
                    <button
                      onClick={() => handleDelete(inv)}
                      style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}
                      title="Delete"
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 18 }}>New Invoice</div>
            <form onSubmit={handleAdd}>
              <div className="field">
                <label>Patient Name</label>
                <input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="e.g. Chinedu Okafor" />
              </div>
              <div className="field">
                <label>Description (optional)</label>
                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Consultation + Lab tests" />
              </div>
              <div className="field">
                <label>Amount (₦)</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 15000" />
              </div>
              <div className="field">
                <label>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Invoice'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)',
          padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 60, maxWidth: '85vw', textAlign: 'center',
        }}>
          {toast}
        </div>
      )}
    </>
  )
}
