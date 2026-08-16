import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import ImportExcelModal from '../../components/inventory/ImportExcelModal'
import { useOfflineTable } from '../../lib/useOfflineTable'
import SearchInput from '../../components/common/SearchInput'

const CATEGORIES = ['Consumables', 'Equipment', 'PPE', 'Drug', 'Office Supplies', 'Cleaning & Hygiene', 'Other']

export default function Inventory() {
  const { profile, hospital } = useAuth()

  const { records: items, loading, isOnline, pendingCount, addRecord, deleteRecord, updateRecord, refreshTable } = useOfflineTable('inventory_items', hospital?.id)
  const { records: patients } = useOfflineTable('patients', hospital?.id)
  const { addRecord: addStockRecord } = useOfflineTable('patient_stock_records', hospital?.id)
  const { addRecord: addInvoice } = useOfflineTable('invoices', hospital?.id) // NEW: For billing

  const [showModal, setShowModal] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const [name, setName] = useState(''); const [category, setCategory] = useState(CATEGORIES[0]); const [quantity, setQuantity] = useState(''); const [unit, setUnit] = useState('units')
  const [supplier, setSupplier] = useState(''); const [reorderLevel, setReorderLevel] = useState('10'); const [costPrice, setCostPrice] = useState(''); const [sellingPrice, setSellingPrice] = useState('')
  const [batchNumber, setBatchNumber] = useState(''); const [expiryDate, setExpiryDate] = useState(''); const [genericName, setGenericName] = useState(''); const [strength, setStrength] = useState(''); const [dosageForm, setDosageForm] = useState('')

  const [saving, setSaving] = useState(false); const [formError, setFormError] = useState('')
  const [showDispenseModal, setShowDispenseModal] = useState(false); const [dispensingItem, setDispensingItem] = useState(null); const [dispenseQuantity, setDispenseQuantity] = useState('')
  const [dispensing, setDispensing] = useState(false); const [dispenseError, setDispenseError] = useState(''); const [patientSearch, setPatientSearch] = useState(''); const [selectedPatient, setSelectedPatient] = useState(null)

  function showToast(message) { setToast(message); setTimeout(() => setToast(null), 3000) }
  function resetForm() { setName(''); setCategory(CATEGORIES[0]); setQuantity(''); setUnit('units'); setSupplier(''); setReorderLevel('10'); setCostPrice(''); setSellingPrice(''); setBatchNumber(''); setExpiryDate(''); setGenericName(''); setStrength(''); setDosageForm(''); setFormError('') }

  async function handleImportSave(itemPayload, matchedItemId) {
    try {
      if (matchedItemId) {
        const existingItem = items.find(item => item.id === matchedItemId); const currentQuantity = parseInt(existingItem?.quantity, 10) || 0; const importedQuantity = parseInt(itemPayload.quantity, 10) || 0
        return await updateRecord(matchedItemId, { quantity: currentQuantity + importedQuantity, category: itemPayload.category || existingItem?.category || 'Other', unit: itemPayload.unit || existingItem?.unit || 'units', supplier: itemPayload.supplier || existingItem?.supplier || '', reorder_level: parseInt(itemPayload.reorderLevel, 10) || 10, cost_price: parseFloat(itemPayload.costPrice) || 0, selling_price: parseFloat(itemPayload.sellingPrice) || 0, batch_number: itemPayload.batchNumber || '', expiry_date: itemPayload.expiryDate || null, generic_name: itemPayload.genericName || '', strength: itemPayload.strength || '', dosage_form: itemPayload.dosageForm || '', updated_at: new Date().toISOString() })
      }
      return await addRecord({ name: itemPayload.name || 'Unnamed Item', category: itemPayload.category || 'Other', quantity: parseInt(itemPayload.quantity, 10) || 0, unit: itemPayload.unit || 'units', supplier: itemPayload.supplier || '', reorder_level: parseInt(itemPayload.reorderLevel, 10) || 10, cost_price: parseFloat(itemPayload.costPrice) || 0, selling_price: parseFloat(itemPayload.sellingPrice) || 0, batch_number: itemPayload.batchNumber || '', expiry_date: itemPayload.expiryDate || null, generic_name: itemPayload.genericName || '', strength: itemPayload.strength || '', dosage_form: itemPayload.dosageForm || '', hospital_id: hospital?.id, created_by: profile?.id })
    } catch (error) { console.error('Import failed:', error); throw error }
  }

  async function handleCloseImportModal() { setIsImportModalOpen(false); if (refreshTable) await refreshTable() }

  async function handleAdd(event) {
    event.preventDefault(); setFormError('')
    if (!name.trim()) return setFormError('Item name is required.')
    if (quantity === '') return setFormError('Quantity is required.')
    const parsedQuantity = parseInt(quantity, 10)
    if (Number.isNaN(parsedQuantity) || parsedQuantity < 0) return setFormError('Quantity must be a valid number.')
    if (!hospital || !profile) return setFormError('Still loading your account...')
    setSaving(true)
    try {
      await addRecord({ name: name.trim(), category, quantity: parsedQuantity, unit: unit.trim() || 'units', supplier: supplier.trim(), reorder_level: parseInt(reorderLevel, 10) || 10, cost_price: parseFloat(costPrice) || 0, selling_price: parseFloat(sellingPrice) || 0, batch_number: batchNumber.trim(), expiry_date: expiryDate || null, generic_name: genericName.trim(), strength: strength.trim(), dosage_form: dosageForm.trim(), hospital_id: hospital.id, created_by: profile.id })
      setShowModal(false); resetForm(); showToast(isOnline ? 'Item added successfully' : 'Item added — will sync when back online')
    } catch (error) { setFormError(error.message || 'Could not save item') } finally { setSaving(false) }
  }

  async function handleRestock(item) {
    const input = prompt(`Current stock: ${item.quantity} ${item.unit}\n\nEnter new quantity:`, item.quantity)
    if (input === null) return
    const newQuantity = parseInt(input, 10)
    if (Number.isNaN(newQuantity) || newQuantity < 0) return showToast('Please enter a valid quantity.')
    try { await updateRecord(item.id, { quantity: newQuantity, updated_at: new Date().toISOString() }); showToast(isOnline ? 'Stock updated' : 'Stock updated — will sync when back online') } catch (error) { showToast(error.message || 'Could not update stock') }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Remove ${item.name} from inventory?`)) return
    try { await deleteRecord(item.id); showToast('Item removed') } catch (error) { showToast(error.message || 'Could not remove item') }
  }

  function openDispense(item) { setDispensingItem(item); setDispenseQuantity(''); setDispenseError(''); setPatientSearch(''); setSelectedPatient(null); setShowDispenseModal(true) }
  function closeDispense() { if (dispensing) return; setShowDispenseModal(false); setDispensingItem(null); setDispenseQuantity(''); setDispenseError(''); setPatientSearch(''); setSelectedPatient(null) }

  const filteredPatients = patientSearch.trim() ? patients.filter(p => String(p.full_name || '').toLowerCase().includes(patientSearch.trim().toLowerCase())).slice(0, 5) : []

  async function handleDispense(e) {
    e.preventDefault(); if (!dispensingItem) return; setDispenseError('')
    const quantityToDispense = parseInt(dispenseQuantity, 10)
    if (isNaN(quantityToDispense) || quantityToDispense <= 0) return setDispenseError('Enter a valid quantity greater than zero.')
    if (!selectedPatient) return setDispenseError('Please select a patient to dispense to.')
    const currentQuantity = parseInt(dispensingItem.quantity, 10) || 0
    if (quantityToDispense > currentQuantity) return setDispenseError(`Insufficient stock. Only ${currentQuantity} ${dispensingItem.unit || 'units'} available.`)

    setDispensing(true)
    try {
      const newQuantity = currentQuantity - quantityToDispense
      const unitPrice = Number(dispensingItem.selling_price || 0)
      const totalPrice = unitPrice * quantityToDispense

      await updateRecord(dispensingItem.id, { quantity: newQuantity, updated_at: new Date().toISOString() })
      await addStockRecord({ patient_id: selectedPatient.id, patient_name: selectedPatient.full_name, item_type: 'inventory', item_id: dispensingItem.id, item_name: dispensingItem.name, quantity_used: quantityToDispense, unit_price: unitPrice, total_price: totalPrice, created_by: profile?.id })
      await addInvoice({ hospital_id: hospital?.id, patient_id: selectedPatient.id, patient_name: selectedPatient.full_name, description: `Inventory: ${dispensingItem.name} (x${quantityToDispense})`, amount: totalPrice, status: 'unpaid', created_by: profile?.id })

      showToast(`${quantityToDispense} ${dispensingItem.unit || 'units'} of ${dispensingItem.name} given. ₦${totalPrice.toFixed(2)} added to bill.`)
      closeDispense(); if (refreshTable) await refreshTable()
    } catch (err) { setDispenseError(err.message || 'Could not dispense item.') } finally { setDispensing(false) }
  }

  const inventorySearch = searchTerm.trim().toLowerCase()
  const sorted = [...items].filter(item => !inventorySearch || [item.name, item.category, item.supplier, item.batch_number].some(v => String(v || '').toLowerCase().includes(inventorySearch))).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const lowStockItems = items.filter(item => Number(item.quantity || 0) <= Number(item.reorder_level || 0))

  return (
    <>
      <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="dash-stat-card" style={{ minHeight: 120, padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="dash-stat-icon" style={{ width: 58, height: 58, minWidth: 58, borderRadius: 14, background: 'var(--teal-soft)', color: 'var(--teal)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 30, height: 30 }}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></div>
          <div><div className="dash-stat-label" style={{ fontSize: 12, marginBottom: 4 }}>Total Items Tracked</div><div className="dash-stat-value" style={{ fontSize: 28, lineHeight: 1.1, marginBottom: 4 }}>{items.length}</div><div className="dash-stat-delta" style={{ fontSize: 11 }}>across all categories</div></div>
        </div>
        <div className="dash-stat-card" style={{ minHeight: 120, padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="dash-stat-icon" style={{ width: 58, height: 58, minWidth: 58, borderRadius: 14, background: 'rgba(225,104,94,0.14)', color: 'var(--danger)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 30, height: 30 }}><path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg></div>
          <div><div className="dash-stat-label" style={{ fontSize: 12, marginBottom: 4 }}>Low Stock Alerts</div><div className="dash-stat-value" style={{ fontSize: 28, lineHeight: 1.1, marginBottom: 4, color: lowStockItems.length > 0 ? 'var(--danger)' : undefined }}>{lowStockItems.length}</div><div className="dash-stat-delta" style={{ fontSize: 11, color: 'var(--gold)' }}>at or below reorder level</div></div>
        </div>
      </div>

      <div className="dash-panel">
        <div className="dash-panel-head">
          <div><div className="dash-panel-title">Inventory & Supplies</div><div className="dash-panel-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? 'var(--teal)' : 'var(--danger)', display: 'inline-block' }} />{isOnline ? 'Online' : 'Offline'}{pendingCount > 0 ? ` · ${pendingCount} syncing` : ''}</div></div>
          <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search item..." style={{ minWidth: 260, maxWidth: 420 }} />
          <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setIsImportModalOpen(true)}>📊 Import Excel</button><button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => { resetForm(); setShowModal(true) }}>+ New Item</button></div>
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div> : sorted.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No items found.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Item', 'Category', 'Stock', 'Supplier', 'Batch', 'Expiry', ''].map(h => <th key={h} style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '0 12px 12px', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>)}</tr></thead>
              <tbody>
                {sorted.map(item => {
                  const quantity = Number(item.quantity || 0); const reorderLevel = Number(item.reorder_level || 0); const low = quantity <= reorderLevel
                  return (
                    <tr key={item.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                      <td style={{ padding: 12 }}><div style={{ fontWeight: 700 }}>{item.name}</div></td>
                      <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5 }}>{item.category}</td>
                      <td style={{ padding: 12 }}><span onClick={() => handleRestock(item)} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', background: low ? 'rgba(225,104,94,0.14)' : 'var(--teal-soft)', color: low ? 'var(--danger)' : 'var(--teal)' }}>{quantity} {item.unit}</span></td>
                      <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5 }}>{item.supplier || '—'}</td>
                      <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12 }}>{item.batch_number || '—'}</td>
                      <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12 }}>{item.expiry_date || '—'}</td>
                      <td style={{ padding: 12, display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary" style={{ width: 'auto', padding: '7px 12px', fontSize: 11, opacity: quantity <= 0 ? 0.5 : 1 }} disabled={quantity <= 0} onClick={() => openDispense(item)}>Dispense/Use</button>
                        <button onClick={() => handleDelete(item)} style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 18 }}>New Inventory Item</div>
            {formError && <div className="error-box">{formError}</div>}
            <form onSubmit={handleAdd}>
              <div className="field"><label>Item Name *</label><input value={name} onChange={e => setName(e.target.value)} /></div>
              <div className="field"><label>Category *</label><select value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(v => <option key={v} value={v}>{v}</option>)}</select></div>
              <div className="field"><label>Quantity *</label><input type="number" min="0" value={quantity} onChange={e => setQuantity(e.target.value)} /></div>
              <div className="field"><label>Unit</label><input value={unit} onChange={e => setUnit(e.target.value)} /></div>
              <div className="field"><label>Selling Price</label><input type="number" min="0" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} /></div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}><button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Item'}</button></div>
            </form>
          </div>
        </div>
      )}

      <ImportExcelModal isOpen={isImportModalOpen} onClose={handleCloseImportModal} existingInventory={items || []} onImportSuccess={handleImportSave} hospitalId={hospital?.id} />

      {showDispenseModal && dispensingItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 8 }}>Dispense / Use Item</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>{dispensingItem.name}</div>
            <div style={{ padding: 12, borderRadius: 8, background: 'var(--teal-soft)', marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Available Stock & Price</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--teal)', marginTop: 3 }}>{dispensingItem.quantity} {dispensingItem.unit || 'units'}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>₦{Number(dispensingItem.selling_price || 0).toFixed(2)} each</div>
              </div>
            </div>
            {dispenseError && <div className="error-box" style={{ marginBottom: 12 }}>{dispenseError}</div>}
            <form onSubmit={handleDispense}>
              <div className="field" style={{ position: 'relative' }}>
                <label>Select Patient</label>
                <input type="text" value={selectedPatient ? selectedPatient.full_name : patientSearch} onChange={e => { setPatientSearch(e.target.value); setSelectedPatient(null) }} placeholder="Search patient name..." autoFocus disabled={!!selectedPatient} />
                {filteredPatients.length > 0 && !selectedPatient && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 150, overflowY: 'auto' }}>
                    {filteredPatients.map(p => (<div key={p.id} onClick={() => { setSelectedPatient(p); setPatientSearch('') }} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--line-soft)', fontSize: 13 }}>{p.full_name}</div>))}
                  </div>
                )}
                {selectedPatient && <button type="button" onClick={() => setSelectedPatient(null)} style={{ position: 'absolute', right: 10, top: 35, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>}
              </div>
              <div className="field"><label>Quantity to Dispense</label><input type="number" min="1" max={dispensingItem.quantity} value={dispenseQuantity} onChange={e => setDispenseQuantity(e.target.value)} /></div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}><button type="button" className="btn btn-ghost" onClick={closeDispense} disabled={dispensing}>Cancel</button><button type="submit" className="btn btn-primary" disabled={dispensing}>{dispensing ? 'Dispensing…' : 'Confirm Dispense'}</button></div>
            </form>
          </div>
        </div>
      )}
      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 60, maxWidth: '85vw', textAlign: 'center' }}>{toast}</div>}
    </>
  )
}