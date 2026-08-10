import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import SearchInput from '../../components/common/SearchInput'

export default function Pharmacy(){
  const { profile, hospital } = useAuth()
  const { records: items, loading, isOnline, pendingCount, addRecord, deleteRecord, updateRecord } = useOfflineTable('pharmacy_items', hospital?.id)
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('units')
  const [price, setPrice] = useState('')
  const [reorderLevel, setReorderLevel] = useState('10')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleAdd(e){
    e.preventDefault()
    setFormError('')
    if (!name || quantity === '') {
      setFormError('Name and quantity are required.')
      return
    }
    if (!hospital || !profile) {
      setFormError('Still loading your account — try again in a moment.')
      return
    }
    setSaving(true)
    try {
      await addRecord({
        name,
        quantity: parseInt(quantity, 10),
        unit,
        price: parseFloat(price) || 0,
        reorder_level: parseInt(reorderLevel, 10) || 10,
        created_by: profile.id,
      })
      setShowModal(false)
      setName(''); setQuantity(''); setUnit('units'); setPrice(''); setReorderLevel('10')
      showToast(isOnline ? 'Item added' : 'Item added — will sync when back online')
    } catch (err) {
      setFormError(err.message || 'Could not save item')
    } finally {
      setSaving(false)
    }
  }

  async function handleRestock(item){
    const input = prompt(`Current stock: ${item.quantity} ${item.unit}\nEnter new quantity:`, item.quantity)
    if (input === null) return
    const newQty = parseInt(input, 10)
    if (isNaN(newQty) || newQty < 0) return
    await updateRecord(item.id, { quantity: newQty })
    showToast(isOnline ? 'Stock updated' : 'Stock updated — will sync when back online')
  }

  async function handleDelete(item){
    if (!confirm(`Remove ${item.name} from inventory?`)) return
    await deleteRecord(item.id)
    showToast('Item removed')
  }

  const pharmacySearch = searchTerm.trim().toLowerCase()
  const visibleItems = pharmacySearch ? items.filter(i => [i.name, i.patient_name, i.drug_name, i.id].some(v => String(v || '').toLowerCase().includes(pharmacySearch))) : items
  const lowStockCount = items.filter(i => i.quantity <= i.reorder_level).length

  function formatMoney(n){
    return '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })
  }

  return (
    <>
      <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 20 }}>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 3h6l1 4H8l1-4Z"/><path d="M6 7h12l-1 14H7L6 7Z"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Total Items</div>
            <div className="dash-stat-value">{items.length}</div>
            <div className="dash-stat-delta">in inventory</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Low Stock</div>
            <div className="dash-stat-value">{lowStockCount}</div>
            <div className="dash-stat-delta" style={{ color: lowStockCount > 0 ? 'var(--danger)' : 'var(--teal)' }}>
              {lowStockCount > 0 ? 'needs reorder' : 'all stocked'}
            </div>
          </div>
        </div>
      </div>

      <div className="dash-panel">
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Inventory</div>
            <div className="dash-panel-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? 'var(--teal)' : 'var(--danger)', display: 'inline-block' }} />
              {isOnline ? 'Online' : 'Offline'}{pendingCount > 0 ? ` · ${pendingCount} syncing` : ''} · Tap quantity to restock
            </div>
          </div>
          <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search drug, patient or prescription" style={{ minWidth: 260, maxWidth: 420 }} />
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Add Item</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
        ) : visibleItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No items yet. Add your first one above.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Name', 'Quantity', 'Price', '', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '0 12px 12px', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(item => {
                const isLow = item.quantity <= item.reorder_level
                return (
                  <tr key={item.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: 12, fontWeight: 700 }}>{item.name}</td>
                    <td style={{ padding: 12 }}>
                      <span
                        onClick={() => handleRestock(item)}
                        style={{
                          fontFamily: 'var(--font-mono)', fontSize: 12.5, cursor: 'pointer', padding: '4px 10px', borderRadius: 20, fontWeight: 700,
                          background: isLow ? 'var(--danger-soft)' : 'var(--teal-soft)',
                          color: isLow ? 'var(--danger)' : 'var(--teal)',
                        }}
                      >
                        {item.quantity} {item.unit}
                      </span>
                    </td>
                    <td style={{ padding: 12, fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--muted)' }}>{formatMoney(item.price)}</td>
                    <td style={{ padding: 12 }}>
                      {isLow && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--danger)' }}>LOW STOCK</span>}
                    </td>
                    <td style={{ padding: 12 }}>
                      <button
                        onClick={() => handleDelete(item)}
                        style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}
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

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 18 }}>Add Pharmacy Item</div>
            {formError && <div className="error-box">{formError}</div>}
            <form onSubmit={handleAdd}>
              <div className="field">
                <label>Item Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Paracetamol 500mg" />
              </div>
              <div className="field">
                <label>Quantity</label>
                <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="e.g. 200" />
              </div>
              <div className="field">
                <label>Unit</label>
                <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. tablets, bottles, packs" />
              </div>
              <div className="field">
                <label>Price per unit (₦)</label>
                <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 50" />
              </div>
              <div className="field">
                <label>Low Stock Alert Level</label>
                <input type="number" value={reorderLevel} onChange={e => setReorderLevel(e.target.value)} placeholder="e.g. 10" />
                <div className="field-hint">You'll see a "Low Stock" warning once quantity drops to this or below.</div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Item'}</button>
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
