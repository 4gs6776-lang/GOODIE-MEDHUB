import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import SearchInput from '../../components/common/SearchInput'

export default function Pharmacy() {
  const { profile, hospital } = useAuth()

  const {
    records: inventoryItems,
    loading,
    isOnline,
    pendingCount,
    updateRecord,
    refreshTable
  } = useOfflineTable('inventory_items', hospital?.id)

  const { records: patients } = useOfflineTable('patients', hospital?.id)
  const { addRecord: addStockRecord } = useOfflineTable('patient_stock_records', hospital?.id)
  const { addRecord: addInvoice } = useOfflineTable('invoices', hospital?.id) // NEW: For billing

  const [toast, setToast] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showDetails, setShowDetails] = useState(null)
  
  const [showDispenseModal, setShowDispenseModal] = useState(false)
  const [dispensingItem, setDispensingItem] = useState(null)
  const [dispenseQuantity, setDispenseQuantity] = useState('')
  const [dispensing, setDispensing] = useState(false)
  const [dispenseError, setDispenseError] = useState('')
  
  const [patientSearch, setPatientSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState(null)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const drugs = inventoryItems.filter(
    item => String(item.category || '').trim().toLowerCase() === 'drug'
  )

  const pharmacySearch = searchTerm.trim().toLowerCase()
  const visibleItems = pharmacySearch
    ? drugs.filter(item =>
        [item.name, item.generic_name, item.strength, item.dosage_form, item.batch_number, item.supplier, item.id].some(value =>
          String(value || '').toLowerCase().includes(pharmacySearch)
        )
      )
    : drugs

  const lowStockCount = drugs.filter(item => Number(item.quantity || 0) <= Number(item.reorder_level || 0)).length
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const expiredCount = drugs.filter(item => {
    if (!item.expiry_date) return false
    const expiry = new Date(item.expiry_date); expiry.setHours(0, 0, 0, 0)
    return expiry < today
  }).length

  const expiringSoonCount = drugs.filter(item => {
    if (!item.expiry_date) return false
    const expiry = new Date(item.expiry_date); expiry.setHours(0, 0, 0, 0)
    const days = (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    return days >= 0 && days <= 30
  }).length

  function formatMoney(value) {
    return '₦' + Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function formatDate(value) {
    if (!value) return '—'
    const date = new Date(value)
    if (isNaN(date.getTime())) return value
    return date.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function isExpired(item) {
    if (!item.expiry_date) return false
    const expiry = new Date(item.expiry_date); expiry.setHours(0, 0, 0, 0)
    return expiry < today
  }

  function isExpiringSoon(item) {
    if (!item.expiry_date) return false
    const expiry = new Date(item.expiry_date); expiry.setHours(0, 0, 0, 0)
    const days = (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    return days >= 0 && days <= 30
  }

  async function handleRestock(item) {
    const input = prompt(`Current stock: ${item.quantity} ${item.unit}\n\nEnter new quantity:`, item.quantity)
    if (input === null) return
    const newQuantity = parseInt(input, 10)
    if (isNaN(newQuantity) || newQuantity < 0) { showToast('Please enter a valid quantity'); return }

    try {
      await updateRecord(item.id, { quantity: newQuantity, updated_at: new Date().toISOString() })
      showToast(isOnline ? 'Stock updated' : 'Stock updated — will sync when back online')
    } catch (err) { showToast(err.message || 'Could not update stock') }
  }

  function openDispense(item) {
    setDispensingItem(item)
    setDispenseQuantity('')
    setDispenseError('')
    setPatientSearch('')
    setSelectedPatient(null)
    setShowDispenseModal(true)
  }

  function closeDispense() {
    if (dispensing) return
    setShowDispenseModal(false)
    setDispensingItem(null)
    setDispenseQuantity('')
    setDispenseError('')
    setPatientSearch('')
    setSelectedPatient(null)
  }

  const filteredPatients = patientSearch.trim()
    ? patients.filter(p => String(p.full_name || '').toLowerCase().includes(patientSearch.trim().toLowerCase())).slice(0, 5)
    : []

  async function handleDispense(e) {
    e.preventDefault()
    if (!dispensingItem) return
    setDispenseError('')

    const quantityToDispense = parseInt(dispenseQuantity, 10)
    if (isNaN(quantityToDispense) || quantityToDispense <= 0) { setDispenseError('Enter a valid quantity greater than zero.'); return }
    if (!selectedPatient) { setDispenseError('Please select a patient to dispense to.'); return }

    const currentQuantity = parseInt(dispensingItem.quantity, 10) || 0
    if (quantityToDispense > currentQuantity) { setDispenseError(`Insufficient stock. Only ${currentQuantity} ${dispensingItem.unit || 'units'} available.`); return }
    if (isExpired(dispensingItem)) { setDispenseError('This drug has expired and cannot be dispensed.'); return }

    setDispensing(true)

    try {
      const newQuantity = currentQuantity - quantityToDispense
      const unitPrice = Number(dispensingItem.selling_price || 0)
      const totalPrice = unitPrice * quantityToDispense

      // 1. Reduce Stock
      await updateRecord(dispensingItem.id, {
        quantity: newQuantity,
        updated_at: new Date().toISOString()
      })

      // 2. Record dispensing action
      await addStockRecord({
        patient_id: selectedPatient.id,
        patient_name: selectedPatient.full_name,
        item_type: 'pharmacy',
        item_id: dispensingItem.id,
        item_name: dispensingItem.name,
        quantity_used: quantityToDispense,
        unit_price: unitPrice,
        total_price: totalPrice,
        created_by: profile?.id || null
      })

      // 3. Automatically add to patient's bill (Invoice)
      await addInvoice({
        hospital_id: hospital?.id,
        patient_id: selectedPatient.id,
        patient_name: selectedPatient.full_name,
        description: `Pharmacy: ${dispensingItem.name} (x${quantityToDispense})`,
        amount: totalPrice,
        status: 'unpaid',
        created_by: profile?.id || null
      })

      showToast(`${quantityToDispense} ${dispensingItem.unit || 'units'} of ${dispensingItem.name} given to ${selectedPatient.full_name}. ₦${totalPrice.toFixed(2)} added to bill.`)
      closeDispense()
      if (refreshTable) await refreshTable()
    } catch (err) {
      setDispenseError(err.message || 'Could not dispense medication.')
    } finally {
      setDispensing(false)
    }
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 20, width: '100%' }}>
        <div className="dash-stat-card" style={{ minHeight: 110, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 58, height: 58, minWidth: 58, borderRadius: 14, background: 'var(--teal-soft)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="30" height="30"><path d="M9 3h6l1 4H8l1-4Z" /><path d="M6 7h12l-1 14H7L6 7Z" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 5 }}>Total Drugs</div>
            <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>{drugs.length}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>from inventory</div>
          </div>
        </div>
        <div className="dash-stat-card" style={{ minHeight: 110, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 58, height: 58, minWidth: 58, borderRadius: 14, background: 'rgba(225,104,94,0.14)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="30" height="30"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 5 }}>Low Stock</div>
            <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 700, color: lowStockCount > 0 ? 'var(--danger)' : 'var(--text)', marginBottom: 5 }}>{lowStockCount}</div>
            <div style={{ fontSize: 11, color: lowStockCount > 0 ? 'var(--danger)' : 'var(--teal)' }}>{lowStockCount > 0 ? 'needs reorder' : 'all stocked'}</div>
          </div>
        </div>
        <div className="dash-stat-card" style={{ minHeight: 110, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 58, height: 58, minWidth: 58, borderRadius: 14, background: 'rgba(225,104,94,0.14)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="30" height="30"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 5 }}>Expired</div>
            <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 700, color: expiredCount > 0 ? 'var(--danger)' : 'var(--text)', marginBottom: 5 }}>{expiredCount}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>expired drugs</div>
          </div>
        </div>
        <div className="dash-stat-card" style={{ minHeight: 110, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 58, height: 58, minWidth: 58, borderRadius: 14, background: 'rgba(212,175,55,0.14)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="30" height="30"><circle cx="12" cy="12" r="9" /><path d="M12 7v5" /><path d="M12 16h.01" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 5 }}>Expiring Soon</div>
            <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>{expiringSoonCount}</div>
            <div style={{ fontSize: 11, color: 'var(--gold)' }}>within 30 days</div>
          </div>
        </div>
      </div>

      <div className="dash-panel">
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Pharmacy</div>
            <div className="dash-panel-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? 'var(--teal)' : 'var(--danger)', display: 'inline-block' }} />
              {isOnline ? 'Online' : 'Offline'}
              {pendingCount > 0 ? ` · ${pendingCount} syncing` : ''}
              {' · Drugs linked to Inventory & Billing'}
            </div>
          </div>
          <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search drug, generic name, batch..." style={{ minWidth: 260, maxWidth: 420 }} />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading pharmacy...</div>
        ) : visibleItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No drugs found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 950 }}>
              <thead>
                <tr>
                  {['Drug', 'Strength / Form', 'Batch', 'Expiry', 'Stock', 'Selling Price', 'Status', ''].map(header => (
                    <th key={header} style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '0 12px 12px', textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleItems.map(item => {
                  const quantity = Number(item.quantity || 0)
                  const reorderLevel = Number(item.reorder_level || 0)
                  const isLow = quantity <= reorderLevel
                  const expired = isExpired(item)
                  const expiringSoon = isExpiringSoon(item)
                  return (
                    <tr key={item.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                      <td style={{ padding: 12 }}><div style={{ fontWeight: 700 }}>{item.name}</div></td>
                      <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12 }}><div>{item.strength || '—'}</div><div style={{ marginTop: 3 }}>{item.dosage_form || '—'}</div></td>
                      <td style={{ padding: 12, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--muted)' }}>{item.batch_number || '—'}</td>
                      <td style={{ padding: 12, fontSize: 12 }}><span style={{ color: expired ? 'var(--danger)' : expiringSoon ? 'var(--gold)' : 'var(--muted)', fontWeight: expired || expiringSoon ? 700 : 400 }}>{formatDate(item.expiry_date)}</span></td>
                      <td style={{ padding: 12 }}><span onClick={() => handleRestock(item)} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer', padding: '4px 10px', borderRadius: 20, fontWeight: 700, background: isLow ? 'rgba(225,104,94,0.14)' : 'var(--teal-soft)', color: isLow ? 'var(--danger)' : 'var(--teal)' }}>{quantity} {item.unit || 'units'}</span></td>
                      <td style={{ padding: 12, fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--muted)' }}>{formatMoney(item.selling_price)}</td>
                      <td style={{ padding: 12 }}>
                        {expired ? <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--danger)' }}>EXPIRED</span> : isLow ? <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--danger)' }}>LOW STOCK</span> : expiringSoon ? <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--gold)' }}>EXPIRING SOON</span> : <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--teal)' }}>AVAILABLE</span>}
                      </td>
                      <td style={{ padding: 12, display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary" style={{ width: 'auto', padding: '7px 12px', fontSize: 11, opacity: expired || quantity <= 0 ? 0.5 : 1 }} disabled={expired || quantity <= 0} onClick={() => openDispense(item)}>Dispense</button>
                        <button onClick={() => setShowDetails(item)} style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, padding: '6px 9px', cursor: 'pointer', fontSize: 11 }}>View</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showDispenseModal && dispensingItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 8 }}>Dispense Medication</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>{dispensingItem.name}</div>
            <div style={{ padding: 12, borderRadius: 8, background: 'var(--teal-soft)', marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Available Stock & Price</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--teal)', marginTop: 3 }}>{dispensingItem.quantity} {dispensingItem.unit || 'units'}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>{formatMoney(dispensingItem.selling_price)} each</div>
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
              <div className="field">
                <label>Quantity to Dispense</label>
                <input type="number" min="1" max={dispensingItem.quantity} value={dispenseQuantity} onChange={e => setDispenseQuantity(e.target.value)} placeholder={`Maximum ${dispensingItem.quantity}`} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button type="button" className="btn btn-ghost" onClick={closeDispense} disabled={dispensing}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={dispensing}>{dispensing ? 'Dispensing…' : 'Confirm Dispense'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 60, maxWidth: '85vw', textAlign: 'center' }}>{toast}</div>}
    </>
  )
}