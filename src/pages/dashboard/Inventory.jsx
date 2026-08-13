import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import ImportExcelModal from '../../components/inventory/ImportExcelModal';
import { useOfflineTable } from '../../lib/useOfflineTable'
import SearchInput from '../../components/common/SearchInput'

const CATEGORIES = ['Consumables', 'Equipment', 'PPE', 'Drug', 'Office Supplies', 'Cleaning & Hygiene', 'Other']

export default function Inventory(){
  const { profile, hospital } = useAuth()
  const { records: items, loading, isOnline, pendingCount, addRecord, deleteRecord, updateRecord, refreshTable } = useOfflineTable('inventory_items', hospital?.id)
  const [showModal, setShowModal] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const [name, setName] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('units')
  const [supplier, setSupplier] = useState('')
  const [reorderLevel, setReorderLevel] = useState('10')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleImportSave(itemPayload, matchedItemId) {
    try {
      if (matchedItemId) {
        const updated = await updateRecord(matchedItemId, {
          quantity: parseInt(itemPayload.quantity, 10) || 0,
          updated_at: itemPayload.updated_at || new Date().toISOString()
        })
        return updated
      } else {
        const created = await addRecord({
          name: itemPayload.drug_name || itemPayload.name || 'Unnamed Item',
          category: itemPayload.category || 'Other',
          quantity: parseInt(itemPayload.quantity, 10) || 0,
          unit: itemPayload.unit || 'units',
          supplier: itemPayload.supplier || itemPayload.brand_name || '',
          reorder_level: parseInt(itemPayload.reorder_level, 10) || 10,
          hospital_id: hospital?.id,
          created_by: profile?.id || null,
        })
        return created
      }
    } catch (err) {
      console.error('Import save failed for item:', itemPayload, err)
      throw err
    }
  }

  async function handleCloseImportModal() {
    setIsImportModalOpen(false)
    if (refreshTable) {
      await refreshTable()
    }
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
        category,
        quantity: parseInt(quantity, 10),
        unit,
        supplier,
        reorder_level: parseInt(reorderLevel, 10) || 10,
        hospital_id: hospital.id,
        created_by: profile.id,
      })
      setShowModal(false)
      setName(''); setCategory(CATEGORIES[0]); setQuantity(''); setUnit('units'); setSupplier(''); setReorderLevel('10')
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

  const inventorySearch = searchTerm.trim().toLowerCase()
  const sorted = [...items].filter(i => !inventorySearch || [i.name, i.category, i.supplier, i.item_code, i.id].some(v => String(v || '').toLowerCase().includes(inventorySearch))).sort((a, b) => a.name.localeCompare(b.name))
  const lowStockItems = items.filter(i => i.quantity <= i.reorder_level)
  const totalItems = items.length

  return (
    <>
      <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 20 }}>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Total Items Tracked</div>
            <div className="dash-stat-value">{totalItems}</div>
            <div className="dash-stat-delta">across all categories</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(225,104,94,0.14)', color: 'var(--danger)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Low Stock Alerts</div>
            <div className="dash-stat-value" style={{ color: lowStockItems.length > 0 ? 'var(--danger)' : undefined }}>{lowStockItems.length}</div>
            <div className="dash-stat-delta" style={{ color: 'var(--gold)' }}>at or below reorder level</div>
          </div>
        </div>
      </div>

      <div className="dash-panel">
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Inventory & Supplies</div>
            <div className="dash-panel-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? 'var(--teal)' : 'var(--danger)', display: 'inline-block' }} />
              {isOnline ? 'Online' : 'Offline'}{pendingCount > 0 ? ` · ${pendingCount} syncing` : ''}
            </div>
          </div>
          <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search item, category, supplier or code" style={{ minWidth: 260, maxWidth: 420 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setIsImportModalOpen(true)}>
              📊 Import Excel
            </button>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New Item</button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No inventory items yet. Add your first one above.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Item', 'Category', 'Stock', 'Supplier', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '0 12px 12px', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(item => {
                const low = item.quantity <= item.reorder_level
                return (
                  <tr key={item.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: 12, fontWeight: 700 }}>{item.name}</td>
                    <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5 }}>{item.category}</td>
                    <td style={{ padding: 12 }}>
                      <span
                        onClick={() => handleRestock(item)}
                        style={{
                          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                          background: low ? 'rgba(225,104,94,0.14)' : 'var(--teal-soft)',
                          color: low ? 'var(--danger)' : 'var(--teal)',
                        }}
                        title="Tap to update stock"
                      >
                        {item.quantity} {item.unit}
                      </span>
                    </td>
                    <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5 }}>{item.supplier || '—'}</td>
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
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 18 }}>New Inventory Item</div>
            {formError && <div className="error-box">{formError}</div>}
            <form onSubmit={handleAdd}>
              <div className="field">
                <label>Item Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Surgical Gloves (Box)" />
              </div>
              <div className="field">
                <label>Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Quantity</label>
                <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" />
              </div>
              <div className="field">
                <label>Unit</label>
                <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. units, boxes, packs" />
              </div>
              <div className="field">
                <label>Supplier</label>
                <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. MedSupply Nigeria" />
              </div>
              <div className="field">
                <label>Reorder Level</label>
                <input type="number" value={reorderLevel} onChange={e => setReorderLevel(e.target.value)} placeholder="10" />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Item'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ImportExcelModal
        isOpen={isImportModalOpen}
        onClose={handleCloseImportModal}
        existingInventory={items || []}
        onImportSuccess={handleImportSave}
        hospitalId={hospital?.id}
      />

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
