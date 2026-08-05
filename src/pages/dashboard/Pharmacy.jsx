import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'

function daysUntil(dateStr){
  if (!dateStr) return null
  const diff = new Date(dateStr) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function stockBadge(item){
  const dLeft = daysUntil(item.expiry_date)
  if (item.quantity < 10 || (dLeft !== null && dLeft < 0)) return { label: dLeft !== null && dLeft < 0 ? 'Expired' : 'Critical Low', color: 'var(--danger)', bg: 'var(--danger-soft)' }
  if (dLeft !== null && dLeft < 60) return { label: 'Nearing Expiry', color: 'var(--gold)', bg: 'rgba(201,169,97,0.14)' }
  return { label: 'Healthy', color: 'var(--teal)', bg: 'var(--teal-soft)' }
}

export default function Pharmacy(){
  const { profile, hospital } = useAuth()
  const inv = useOfflineTable('pharmacy_items', hospital?.id)
  const rx = useOfflineTable('prescriptions', hospital?.id)
  const [view, setView] = useState('dispensing') // 'dispensing' | 'inventory'
  const [toast, setToast] = useState(null)

  const [showRxModal, setShowRxModal] = useState(false)
  const [rxPatient, setRxPatient] = useState('')
  const [rxDoctor, setRxDoctor] = useState('')
  const [rxItemId, setRxItemId] = useState('')
  const [rxMedName, setRxMedName] = useState('')
  const [rxDosage, setRxDosage] = useState('')
  const [rxFreq, setRxFreq] = useState('')
  const [savingRx, setSavingRx] = useState(false)
  const [rxError, setRxError] = useState('')

  const [showItemModal, setShowItemModal] = useState(false)
  const [itemName, setItemName] = useState('')
  const [itemQty, setItemQty] = useState('')
  const [itemUnit, setItemUnit] = useState('units')
  const [itemPrice, setItemPrice] = useState('')
  const [itemReorder, setItemReorder] = useState('10')
  const [itemBatch, setItemBatch] = useState('')
  const [itemExpiry, setItemExpiry] = useState('')
  const [savingItem, setSavingItem] = useState(false)
  const [itemError, setItemError] = useState('')

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleAddPrescription(e){
    e.preventDefault()
    setRxError('')
    const medName = rxItemId ? inv.records.find(i => i.id === rxItemId)?.name : rxMedName
    if (!rxPatient || !medName) {
      setRxError('Patient name and medication are required.')
      return
    }
    setSavingRx(true)
    try {
      await rx.addRecord({
        patient_name: rxPatient,
        doctor_name: rxDoctor || null,
        medication_name: medName,
        dosage: rxDosage || null,
        frequency: rxFreq || null,
        pharmacy_item_id: rxItemId || null,
        status: 'pending',
        created_by: profile.id,
      })
      setShowRxModal(false)
      setRxPatient(''); setRxDoctor(''); setRxItemId(''); setRxMedName(''); setRxDosage(''); setRxFreq('')
      showToast(rx.isOnline ? 'Prescription added' : 'Prescription added — will sync when back online')
    } catch (err) {
      setRxError(err.message || 'Could not save prescription')
    } finally {
      setSavingRx(false)
    }
  }

  async function handleFulfill(prescription){
    if (!prescription.pharmacy_item_id) {
      await rx.updateRecord(prescription.id, { status: 'dispensed' })
      showToast('Marked dispensed')
      return
    }
    const item = inv.records.find(i => i.id === prescription.pharmacy_item_id)
    if (!item || item.quantity <= 0) {
      await rx.updateRecord(prescription.id, { status: 'out_of_stock' })
      showToast('Out of stock — flagged for reorder')
      return
    }
    await inv.updateRecord(item.id, { quantity: item.quantity - 1 })
    await rx.updateRecord(prescription.id, { status: 'dispensed' })
    showToast('Dispensed — stock updated')
  }

  async function handleAddItem(e){
    e.preventDefault()
    setItemError('')
    if (!itemName || itemQty === '') {
      setItemError('Name and quantity are required.')
      return
    }
    setSavingItem(true)
    try {
      await inv.addRecord({
        name: itemName,
        quantity: parseInt(itemQty, 10),
        unit: itemUnit,
        price: parseFloat(itemPrice) || 0,
        reorder_level: parseInt(itemReorder, 10) || 10,
        batch_number: itemBatch || null,
        expiry_date: itemExpiry || null,
        created_by: profile.id,
      })
      setShowItemModal(false)
      setItemName(''); setItemQty(''); setItemUnit('units'); setItemPrice(''); setItemReorder('10'); setItemBatch(''); setItemExpiry('')
      showToast(inv.isOnline ? 'Item added' : 'Item added — will sync when back online')
    } catch (err) {
      setItemError(err.message || 'Could not save item')
    } finally {
      setSavingItem(false)
    }
  }

  async function handleDeleteItem(item){
    if (!confirm(`Remove ${item.name} from inventory?`)) return
    await inv.deleteRecord(item.id)
    showToast('Item removed')
  }

  async function handleDeleteRx(p){
    if (!confirm(`Delete this prescription for ${p.patient_name}?`)) return
    await rx.deleteRecord(p.id)
    showToast('Prescription deleted')
  }

  function formatMoney(n){
    return '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })
  }

  const STATUS_STYLE = {
    pending: { label: 'Pending Dispense', color: 'var(--gold)', bg: 'rgba(201,169,97,0.14)' },
    dispensed: { label: 'Dispensed', color: 'var(--teal)', bg: 'var(--teal-soft)' },
    out_of_stock: { label: 'Out of Stock', color: 'var(--danger)', bg: 'var(--danger-soft)' },
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button
          onClick={() => setView('dispensing')}
          className="btn"
          style={{ width: 'auto', background: view === 'dispensing' ? 'var(--teal)' : 'transparent', color: view === 'dispensing' ? '#00251F' : 'var(--muted)', border: view === 'dispensing' ? 'none' : '1px solid var(--line)' }}
        >Dispensing Counter</button>
        <button
          onClick={() => setView('inventory')}
          className="btn"
          style={{ width: 'auto', background: view === 'inventory' ? 'var(--teal)' : 'transparent', color: view === 'inventory' ? '#00251F' : 'var(--muted)', border: view === 'inventory' ? 'none' : '1px solid var(--line)' }}
        >Batch &amp; Expiry Inventory</button>
      </div>

      {view === 'dispensing' && (
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <div className="dash-panel-title">Live Prescription Feed</div>
              <div className="dash-panel-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: rx.isOnline ? 'var(--teal)' : 'var(--danger)', display: 'inline-block' }} />
                {rx.isOnline ? 'Online' : 'Offline'}{rx.pendingCount > 0 ? ` · ${rx.pendingCount} syncing` : ''}
              </div>
            </div>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowRxModal(true)}>+ New Prescription</button>
          </div>

          {rx.loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
          ) : rx.records.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No prescriptions yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rx.records.map(p => {
                const st = STATUS_STYLE[p.status]
                return (
                  <div key={p.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{p.medication_name} {p.dosage && <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· {p.dosage}</span>}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                        {p.patient_name} {p.doctor_name && `· Dr. ${p.doctor_name}`} {p.frequency && `· ${p.frequency}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
                      {p.status !== 'dispensed' && (
                        <button
                          onClick={() => handleFulfill(p)}
                          className="btn btn-primary"
                          style={{ width: 'auto', padding: '8px 14px', fontSize: 12 }}
                        >Fulfill &amp; Mark Dispensed</button>
                      )}
                      <button
                        onClick={() => handleDeleteRx(p)}
                        style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}
                        title="Delete"
                      >✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {view === 'inventory' && (
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <div className="dash-panel-title">Batch &amp; Expiry Tracker</div>
              <div className="dash-panel-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: inv.isOnline ? 'var(--teal)' : 'var(--danger)', display: 'inline-block' }} />
                {inv.isOnline ? 'Online' : 'Offline'}{inv.pendingCount > 0 ? ` · ${inv.pendingCount} syncing` : ''} · Tap quantity to restock
              </div>
            </div>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowItemModal(true)}>+ Add Item</button>
          </div>

          {inv.loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
          ) : inv.records.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No items yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Name', 'Batch #', 'Stock', 'Unit Cost', 'Expiry', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '0 12px 12px', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inv.records.map(item => {
                  const badge = stockBadge(item)
                  return (
                    <tr key={item.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                      <td style={{ padding: 12, fontWeight: 700 }}>{item.name}</td>
                      <td style={{ padding: 12, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>{item.batch_number || '—'}</td>
                      <td style={{ padding: 12 }}>
                        <span
                          onClick={async () => {
                            const input = prompt(`Current stock: ${item.quantity} ${item.unit}\nEnter new quantity:`, item.quantity)
                            if (input === null) return
                            const q = parseInt(input, 10)
                            if (isNaN(q) || q < 0) return
                            await inv.updateRecord(item.id, { quantity: q })
                            showToast('Stock updated')
                          }}
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, cursor: 'pointer', padding: '4px 10px', borderRadius: 20, fontWeight: 700, background: badge.bg, color: badge.color }}
                        >
                          {item.quantity} {item.unit}
                        </span>
                      </td>
                      <td style={{ padding: 12, fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--muted)' }}>{formatMoney(item.price)}</td>
                      <td style={{ padding: 12, fontSize: 12, color: 'var(--muted)' }}>{item.expiry_date || '—'}</td>
                      <td style={{ padding: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: badge.color }}>{badge.label}</span>
                        <button
                          onClick={() => handleDeleteItem(item)}
                          style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', flexShrink: 0 }}
                          title="Delete"
                        >✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showRxModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 400, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 18 }}>New Prescription</div>
            {rxError && <div className="error-box">{rxError}</div>}
            <form onSubmit={handleAddPrescription}>
              <div className="field">
                <label>Patient Name</label>
                <input value={rxPatient} onChange={e => setRxPatient(e.target.value)} placeholder="e.g. Chinedu Okafor" />
              </div>
              <div className="field">
                <label>Prescribing Doctor</label>
                <input value={rxDoctor} onChange={e => setRxDoctor(e.target.value)} placeholder="e.g. Dr. Adaeze" />
              </div>
              <div className="field">
                <label>Medication (from inventory, optional)</label>
                <select value={rxItemId} onChange={e => setRxItemId(e.target.value)}>
                  <option value="">— Type medication name manually below —</option>
                  {inv.records.map(item => <option key={item.id} value={item.id}>{item.name} ({item.quantity} in stock)</option>)}
                </select>
              </div>
              {!rxItemId && (
                <div className="field">
                  <label>Medication Name</label>
                  <input value={rxMedName} onChange={e => setRxMedName(e.target.value)} placeholder="e.g. Amoxicillin 500mg" />
                </div>
              )}
              <div className="field">
                <label>Dosage</label>
                <input value={rxDosage} onChange={e => setRxDosage(e.target.value)} placeholder="e.g. 1 tablet" />
              </div>
              <div className="field">
                <label>Frequency</label>
                <input value={rxFreq} onChange={e => setRxFreq(e.target.value)} placeholder="e.g. Twice daily for 5 days" />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowRxModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingRx}>{savingRx ? 'Saving…' : 'Save Prescription'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showItemModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 400, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 18 }}>Add Pharmacy Item</div>
            {itemError && <div className="error-box">{itemError}</div>}
            <form onSubmit={handleAddItem}>
              <div className="field">
                <label>Item Name</label>
                <input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="e.g. Paracetamol 500mg" />
              </div>
              <div className="field">
                <label>Batch Number</label>
                <input value={itemBatch} onChange={e => setItemBatch(e.target.value)} placeholder="e.g. BN-2026-0143" />
              </div>
              <div className="field">
                <label>Quantity</label>
                <input type="number" value={itemQty} onChange={e => setItemQty(e.target.value)} placeholder="e.g. 200" />
              </div>
              <div className="field">
                <label>Unit</label>
                <input value={itemUnit} onChange={e => setItemUnit(e.target.value)} placeholder="e.g. tablets, bottles" />
              </div>
              <div className="field">
                <label>Unit Cost (₦)</label>
                <input type="number" value={itemPrice} onChange={e => setItemPrice(e.target.value)} placeholder="e.g. 50" />
              </div>
              <div className="field">
                <label>Expiry Date</label>
                <input type="date" value={itemExpiry} onChange={e => setItemExpiry(e.target.value)} />
              </div>
              <div className="field">
                <label>Low Stock Alert Level</label>
                <input type="number" value={itemReorder} onChange={e => setItemReorder(e.target.value)} placeholder="e.g. 10" />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowItemModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingItem}>{savingItem ? 'Saving…' : 'Save Item'}</button>
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
