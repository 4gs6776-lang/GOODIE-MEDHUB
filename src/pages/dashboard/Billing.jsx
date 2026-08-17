import { useState, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'

const STATUS_STYLES = {
  paid: { bg: 'rgba(46,204,113,0.15)', color: '#2ecc71', label: 'Paid' },
  unpaid: { bg: 'rgba(235,87,87,0.15)', color: '#eb5757', label: 'Unpaid' },
  partial: { bg: 'rgba(242,201,76,0.15)', color: '#f2c94c', label: 'Partial' },
  pending: { bg: 'rgba(76,141,255,0.15)', color: '#4c8dff', label: 'Pending' },
  cancelled: { bg: 'rgba(107,114,128,0.15)', color: '#6b7280', label: 'Cancelled' }
}
const METHODS = ['Cash', 'POS', 'Bank Transfer', 'Card', 'HMO', 'Insurance', 'Other']

export default function Billing() {
  const { profile, hospital } = useAuth()
  const { records: invoices, loading, isOnline, pendingCount, addRecord: addInvoice } = useOfflineTable('invoices', hospital?.id)
  const { records: patients } = useOfflineTable('patients', hospital?.id)
  const { records: inventoryItems } = useOfflineTable('inventory_items', hospital?.id)
  const { addRecord: addInvoiceItem } = useOfflineTable('invoice_items', hospital?.id)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [toast, setToast] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [step, setStep] = useState(1)
  const [patientSearch, setPatientSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [itemSearch, setItemSearch] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [amountPaid, setAmountPaid] = useState('')
  const [saving, setSaving] = useState(false)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000) }
  const formatMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const kpis = useMemo(() => {
    const tStr = new Date().toDateString(), tMonth = new Date().getMonth()
    const tRev = invoices.filter(i => new Date(i.created_at).toDateString() === tStr).reduce((s, i) => s + Number(i.amount_paid || 0), 0)
    const mRev = invoices.filter(i => new Date(i.created_at).getMonth() === tMonth).reduce((s, i) => s + Number(i.amount_paid || 0), 0)
    const out = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((s, i) => s + Number(i.balance || 0), 0)
    return { tRev, mRev, out, total: invoices.length }
  }, [invoices])

  const paidVsOut = useMemo(() => {
    const pT = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.grand_total || 0), 0)
    const oT = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((s, i) => s + Number(i.balance || 0), 0)
    const tot = pT + oT, pP = tot > 0 ? (pT / tot) * 100 : 0
    return { pT, oT, pP }
  }, [invoices])

  const methodData = useMemo(() => {
    const m = {}; METHODS.forEach(x => m[x] = 0)
    invoices.forEach(i => { const k = i.payment_method || 'Cash'; m[k] = (m[k] || 0) + Number(i.amount_paid || 0) })
    const max = Math.max(...Object.values(m), 1)
    return Object.entries(m).map(([method, amount]) => ({ method, amount, pct: (amount / max) * 100 }))
  }, [invoices])

  const filteredInv = useMemo(() => {
    return invoices.filter(i => {
      const s = !search || String(i.patient_name || '').toLowerCase().includes(search.toLowerCase()) || String(i.invoice_number || '').toLowerCase().includes(search.toLowerCase())
      const st = statusFilter === 'all' || i.status === statusFilter
      return s && st
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [invoices, search, statusFilter])

  const resetModal = () => { setShowModal(false); setStep(1); setPatientSearch(''); setSelectedPatient(null); setLineItems([]); setItemSearch(''); setPaymentMethod('Cash'); setAmountPaid(''); setSaving(false) }
  const filteredPats = patientSearch.trim() ? patients.filter(p => String(p.full_name || '').toLowerCase().includes(patientSearch.trim().toLowerCase())).slice(0, 5) : []
  const filteredInvItems = itemSearch.trim() ? inventoryItems.filter(it => String(it.name || '').toLowerCase().includes(itemSearch.trim().toLowerCase())).slice(0, 5) : []

  const addItem = (item) => { setLineItems(p => [...p, { tempId: Date.now(), item_id: item.id, item_name: item.name, unit_price: Number(item.selling_price || 0), quantity: 1, total: Number(item.selling_price || 0) }]); setItemSearch('') }
  const addCustom = () => setLineItems(p => [...p, { tempId: Date.now(), item_id: null, item_name: 'Custom Service', unit_price: 0, quantity: 1, total: 0 }])
  const updateItem = (id, k, v) => setLineItems(p => p.map(li => { if (li.tempId === id) { const u = { ...li, [k]: v }; u.total = (Number(u.quantity) || 0) * (Number(u.unit_price) || 0); return u } return li }))
  const removeItem = (id) => setLineItems(p => p.filter(li => li.tempId !== id))

  const subtotal = lineItems.reduce((s, li) => s + Number(li.total || 0), 0)
  const grandTotal = subtotal

  const handleGenerate = async () => {
    if (!selectedPatient || lineItems.length === 0) return
    setSaving(true)
    try {
      const pAmt = Number(amountPaid) || 0, bal = grandTotal - pAmt
      const status = pAmt >= grandTotal ? 'paid' : (pAmt > 0 ? 'partial' : 'unpaid')
      const newInv = await addInvoice({ hospital_id: hospital.id, patient_id: selectedPatient.id, patient_name: selectedPatient.full_name, invoice_number: `INV-${Date.now().toString().slice(-8)}`, subtotal, grand_total: grandTotal, amount_paid: pAmt, balance: bal, payment_method: paymentMethod, status, created_by: profile?.id })
      for (const item of lineItems) await addInvoiceItem({ hospital_id: hospital.id, invoice_id: newInv.id, item_name: item.item_name, quantity: item.quantity, unit_price: item.unit_price, total: item.total, inventory_item_id: item.item_id })
      showToast('Invoice generated successfully!'); resetModal()
    } catch (err) { showToast(err.message || 'Failed to save'); setSaving(false) }
  }

  return (
    <>
      <div className="dash-panel" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-display)' }}>Billing & Invoices</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? 'var(--teal)' : 'var(--danger)' }} />
              {isOnline ? 'System Online' : 'Offline Mode'} {pendingCount > 0 ? ` · ${pendingCount} syncing` : ''}
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: 'auto', padding: '10px 18px' }} onClick={() => setShowModal(true)}>+ Create Invoice</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[
            { t: "Today's Revenue", v: formatMoney(kpis.tRev), i: "💵", c: "var(--teal)" },
            { t: "This Month", v: formatMoney(kpis.mRev), i: "📈", c: "var(--blue)" },
            { t: "Outstanding", v: formatMoney(kpis.out), i: "⚠️", c: "var(--danger)" },
            { t: "Total Invoices", v: kpis.total, i: "📄", c: "var(--muted)" }
          ].map(k => (
            <div key={k.t} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, minWidth: 48, borderRadius: 12, background: `${k.c}15`, color: k.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{k.i}</div>
              <div><div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{k.t}</div><div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{k.v}</div></div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 20 }}>
        <div className="dash-panel" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 20 }}>Revenue: Paid vs Outstanding</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ width: 120, height: 120, borderRadius: '50%', background: `conic-gradient(var(--teal) ${paidVsOut.pP}%, rgba(235,87,87,0.3) ${paidVsOut.pP}% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>PAID</span><span style={{ fontSize: 16, fontWeight: 700, color: 'var(--teal)' }}>{paidVsOut.pP.toFixed(0)}%</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><span style={{ width: 10, height: 10, background: 'var(--teal)', borderRadius: 3 }} /><span style={{ fontSize: 12, color: 'var(--muted)' }}>Collected</span></div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--teal)' }}>{formatMoney(paidVsOut.pT)}</div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><span style={{ width: 10, height: 10, background: 'rgba(235,87,87,0.3)', borderRadius: 3 }} /><span style={{ fontSize: 12, color: 'var(--muted)' }}>Outstanding</span></div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger)' }}>{formatMoney(paidVsOut.oT)}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="dash-panel" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 20 }}>Payment Methods</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {methodData.map(d => (
              <div key={d.method}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 12, color: 'var(--muted)' }}>{d.method}</span><span style={{ fontSize: 12, fontWeight: 700 }}>{formatMoney(d.amount)}</span></div>
                <div style={{ height: 8, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${d.pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--teal), var(--blue))' }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dash-panel">
        <div className="dash-panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Invoice Management</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input style={{ background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', minWidth: 200 }} placeholder="Search patient or invoice #..." value={search} onChange={e => setSearch(e.target.value)} />
            <select style={{ background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option><option value="unpaid">Unpaid</option><option value="partial">Partially Paid</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
        {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading financial records…</div> : filteredInv.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No invoices found.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="dash-full-table">
              <thead><tr><th>Invoice #</th><th>Patient</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Method</th><th>Status</th></tr></thead>
              <tbody>
                {filteredInv.map(inv => {
                  const st = inv.status || 'unpaid', stl = STATUS_STYLES[st] || STATUS_STYLES.unpaid
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--blue)' }}>{inv.invoice_number || `INV-${String(inv.id).slice(-6).toUpperCase()}`}</td>
                      <td>{inv.patient_name || '—'}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{new Date(inv.created_at).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td style={{ fontWeight: 700 }}>{formatMoney(inv.grand_total || inv.amount)}</td>
                      <td style={{ color: 'var(--teal)' }}>{formatMoney(inv.amount_paid || 0)}</td>
                      <td style={{ color: Number(inv.balance || 0) > 0 ? 'var(--danger)' : 'var(--muted)' }}>{formatMoney(inv.balance || (Number(inv.grand_total || inv.amount) - Number(inv.amount_paid || 0)))}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{inv.payment_method || 'Cash'}</td>
                      <td><span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: stl.bg, color: stl.color }}>{stl.label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }} onClick={e => { if (e.target === e.currentTarget) resetModal() }}>
          <div className="card" style={{ width: '100%', maxWidth: 700, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>{step === 1 ? 'Step 1: Select Patient' : step === 2 ? 'Step 2: Items & Services' : 'Step 3: Review & Payment'}</div>
              <button onClick={resetModal} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
              {step === 1 && (
                <div>
                  <div className="field" style={{ position: 'relative' }}>
                    <label>Search Patient</label>
                    <input type="text" value={selectedPatient ? selectedPatient.full_name : patientSearch} onChange={e => { setPatientSearch(e.target.value); setSelectedPatient(null) }} placeholder="Type patient name..." autoFocus disabled={!!selectedPatient} />
                    {filteredPats.length > 0 && !selectedPatient && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 200, overflowY: 'auto' }}>
                        {filteredPats.map(p => (<div key={p.id} onClick={() => { setSelectedPatient(p); setPatientSearch('') }} style={{ padding: '12px', cursor: 'pointer', borderBottom: '1px solid var(--line-soft)' }}><div style={{ fontWeight: 700 }}>{p.full_name}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.age ? `${p.age} yrs` : ''} {p.gender ? `· ${p.gender}` : ''} {p.phone ? `· ${p.phone}` : ''}</div></div>))}
                      </div>
                    )}
                  </div>
                  {selectedPatient && (
                    <div style={{ marginTop: 20, padding: 16, background: 'var(--teal-soft)', borderRadius: 10, border: '1px solid var(--teal)' }}>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Selected Patient</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--teal)' }}>{selectedPatient.full_name}</div>
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{selectedPatient.age ? `${selectedPatient.age} yrs` : ''} {selectedPatient.gender ? `· ${selectedPatient.gender}` : ''} {selectedPatient.phone ? `· ${selectedPatient.phone}` : ''}</div>
                    </div>
                  )}
                </div>
              )}
              {step === 2 && (
                <div>
                  <div className="field" style={{ position: 'relative' }}>
                    <label>Add Item or Drug (from Inventory)</label>
                    <input type="text" value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder="Search inventory for drugs/equipment..." />
                    {filteredInvItems.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 200, overflowY: 'auto' }}>
                        {filteredInvItems.map(it => (<div key={it.id} onClick={() => addItem(it)} style={{ padding: '12px', cursor: 'pointer', borderBottom: '1px solid var(--line-soft)' }}><div style={{ fontWeight: 700 }}>{it.name}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Price: ₦{Number(it.selling_price || 0).toFixed(2)} · Stock: {it.quantity}</div></div>))}
                      </div>
                    )}
                  </div>
                  <button className="btn btn-ghost" style={{ width: 'auto', fontSize: 12, marginBottom: 16 }} onClick={addCustom}>+ Add Custom Service</button>
                  <div style={{ borderTop: '1px solid var(--line-soft)', marginTop: 10, paddingTop: 10 }}>
                    {lineItems.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px 0' }}>No items added yet.</div> : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {lineItems.map(li => (
                          <div key={li.tempId} style={{ background: 'var(--bg-elevated)', padding: 12, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ flex: 2 }}><input style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontWeight: 700, width: '100%' }} value={li.item_name} onChange={e => updateItem(li.tempId, 'item_name', e.target.value)} /></div>
                            <div style={{ width: 70 }}><input type="number" style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--text)', width: '100%', textAlign: 'center', padding: '6px' }} value={li.quantity} onChange={e => updateItem(li.tempId, 'quantity', e.target.value)} /></div>
                            <div style={{ width: 100 }}><input type="number" style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--text)', width: '100%', textAlign: 'center', padding: '6px' }} value={li.unit_price} onChange={e => updateItem(li.tempId, 'unit_price', e.target.value)} /></div>
                            <div style={{ width: 100, textAlign: 'right', fontWeight: 700, color: 'var(--teal)' }}>₦{Number(li.total || 0).toFixed(2)}</div>
                            <button onClick={() => removeItem(li.tempId)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontWeight: 700 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20, fontSize: 16, fontWeight: 700 }}>Subtotal: <span style={{ marginLeft: 10, color: 'var(--teal)' }}>{formatMoney(subtotal)}</span></div>
                </div>
              )}
              {step === 3 && (
                <div>
                  <div style={{ marginBottom: 20, padding: 16, background: 'var(--bg-elevated)', borderRadius: 10 }}><div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Patient</div><div style={{ fontWeight: 700 }}>{selectedPatient?.full_name}</div></div>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Items Billed</div>
                    {lineItems.map(li => (<div key={li.tempId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}><span>{li.item_name} (x{li.quantity})</span><span style={{ fontWeight: 700 }}>{formatMoney(li.total)}</span></div>))}
                  </div>
                  <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 16, marginBottom: 20, textAlign: 'right' }}><div style={{ fontSize: 18, fontWeight: 800 }}>Grand Total: <span style={{ color: 'var(--teal)' }}>{formatMoney(grandTotal)}</span></div></div>
                  <div className="field"><label>Payment Method</label><select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px', color: 'var(--text)' }}>{METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                  <div className="field"><label>Amount Paid (₦)</label><input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} placeholder={grandTotal.toFixed(2)} style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px', color: 'var(--text)', fontSize: 16, fontWeight: 700 }} /><div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Balance: <strong style={{ color: 'var(--danger)' }}>{formatMoney(grandTotal - (Number(amountPaid) || 0))}</strong></div></div>
                </div>
              )}
            </div>
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              {step > 1 ? <button className="btn btn-ghost" style={{ width: 'auto', padding: '0 20px' }} onClick={() => setStep(step - 1)} disabled={saving}>Back</button> : <div></div>}
              {step < 3 ? <button className="btn btn-primary" style={{ width: 'auto', padding: '0 24px' }} onClick={() => setStep(step + 1)} disabled={(step === 1 && !selectedPatient) || (step === 2 && lineItems.length === 0)}>Next</button> : <button className="btn btn-primary" style={{ width: 'auto', padding: '0 24px' }} onClick={handleGenerate} disabled={saving}>{saving ? 'Saving…' : 'Generate Invoice'}</button>}
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 60 }}>{toast}</div>}
    </>
  )
}
// --- END OF FILE ---