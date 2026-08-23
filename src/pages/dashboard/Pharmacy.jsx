import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import SearchInput from '../../components/common/SearchInput'

export default function Pharmacy() {
  const { profile, hospital } = useAuth()
  const { records: inventoryItems, loading, isOnline, pendingCount, updateRecord, refreshTable } = useOfflineTable('inventory_items', hospital?.id)
  const { records: patients } = useOfflineTable('patients', hospital?.id)
  const { addRecord: addStockRecord } = useOfflineTable('patient_stock_records', hospital?.id)
  const { addRecord: addBillableCharge } = useOfflineTable('billable_charges', hospital?.id)
  
  // NEW: Fetch prescriptions to receive doctor's orders
  const { records: prescriptions, updateRecord: updatePrescription } = useOfflineTable('prescriptions', hospital?.id)
  const [toast, setToast] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showDispenseModal, setShowDispenseModal] = useState(false)
  const [dispensingItem, setDispensingItem] = useState(null)
  const [dispenseQuantity, setDispenseQuantity] = useState('')
  const [dispensing, setDispensing] = useState(false)
  const [dispenseError, setDispenseError] = useState('')
  const [patientSearch, setPatientSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [activeRx, setActiveRx] = useState(null) // Tracks if dispensing from a doctor's order

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000) }
  
  // Doctor's Prescription Queue
  const pendingRx = prescriptions.filter(p => p.status === 'active').sort((a,b) => new Date(a.prescribed_at) - new Date(b.prescribed_at))
  
  const drugs = inventoryItems.filter(item => String(item.category || '').trim().toLowerCase() === 'drug')
  const visibleItems = searchTerm.trim() ? drugs.filter(item => [item.name, item.generic_name, item.strength, item.batch_number].some(v => String(v || '').toLowerCase().includes(searchTerm.toLowerCase()))) : drugs
  const lowStockCount = drugs.filter(item => Number(item.quantity || 0) <= Number(item.reorder_level || 0)).length
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const expiredCount = drugs.filter(item => { if (!item.expiry_date) return false; const e = new Date(item.expiry_date); e.setHours(0,0,0,0); return e < today }).length
  const expiringSoonCount = drugs.filter(item => { if (!item.expiry_date) return false; const e = new Date(item.expiry_date); e.setHours(0,0,0,0); const d = (e.getTime() - today.getTime()) / (1000*60*60*24); return d >= 0 && d <= 30 }).length

  const formatMoney = (v) => '₦' + Number(v || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const formatDate = (v) => { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) }
  const isExpired = (item) => { if (!item.expiry_date) return false; const e = new Date(item.expiry_date); e.setHours(0,0,0,0); return e < today }
  const isExpiringSoon = (item) => { if (!item.expiry_date) return false; const e = new Date(item.expiry_date); e.setHours(0,0,0,0); const d = (e.getTime() - today.getTime()) / (1000*60*60*24); return d >= 0 && d <= 30 }

  const handleRestock = async (item) => {
    const input = prompt(`Current stock: ${item.quantity} ${item.unit}\n\nEnter new quantity:`, item.quantity)
    if (input === null) return
    const newQ = parseInt(input, 10)
    if (isNaN(newQ) || newQ < 0) return showToast('Invalid quantity')
    try { await updateRecord(item.id, { quantity: newQ, updated_at: new Date().toISOString() }); showToast('Stock updated') } catch (e) { showToast(e.message) }
  }

  // Manual Dispense (Over the counter)
  const openDispense = (item) => { 
    setDispensingItem(item); setDispenseQuantity(''); setDispenseError(''); setPatientSearch(''); setSelectedPatient(null); setActiveRx(null); setShowDispenseModal(true) 
  }

  // NEW: Cancel Prescription from Doctor's Queue
  async function handleCancelRx(rx) {
    if (!confirm(`Cancel prescription for ${rx.drug_name}?`)) return
    try {
      await updatePrescription(rx.id, { status: 'cancelled' })
      showToast('Prescription cancelled')
    } catch (err) {
      showToast(err.message || 'Failed to cancel')
    }
  }

  // Automatic Dispense (From Doctor's Queue)
  const openDispenseRx = (rx) => {
    // Find matching drug in inventory
    const matchedDrug = inventoryItems.find(it => 
      String(it.name || '').toLowerCase() === String(rx.drug_name || '').toLowerCase() || 
      String(it.generic_name || '').toLowerCase() === String(rx.drug_name || '').toLowerCase()
    )

    // Find patient
    const matchedPatient = patients.find(p => p.id === rx.patient_id)
    if (!matchedPatient) {
      return showToast(`Patient record not found.`)
    }

    if (!matchedDrug) {
      // NEW: If not in inventory, create a mock item so the pharmacist can still dispense it
      setDispensingItem({
        id: null,
        name: rx.drug_name,
        quantity: 9999, // Don't restrict stock
        unit: 'units',
        selling_price: 0, // Will prompt for price during dispense
        expiry_date: null
      })
      showToast(`"${rx.drug_name}" is not in inventory. Please enter price manually.`)
    } else {
      setDispensingItem(matchedDrug)
    }

    setDispenseQuantity(rx.quantity || '1')
    setDispenseError('')
    setPatientSearch('')
    setSelectedPatient(matchedPatient)
    setActiveRx(rx) // Link this dispense to the doctor's prescription
    setShowDispenseModal(true)
  }

  const closeDispense = () => { 
    if (dispensing) return
    setShowDispenseModal(false); setDispensingItem(null); setDispenseQuantity(''); setDispenseError(''); setPatientSearch(''); setSelectedPatient(null); setActiveRx(null) 
  }
  
  const filteredPatients = patientSearch.trim() ? patients.filter(p => String(p.full_name || '').toLowerCase().includes(patientSearch.trim().toLowerCase())).slice(0, 5) : []

  const handleDispense = async (e) => {
    e.preventDefault()
    if (!dispensingItem) return
    setDispenseError('')
    const qty = parseInt(dispenseQuantity, 10)
    if (isNaN(qty) || qty <= 0) return setDispenseError('Enter valid quantity.')
    if (!selectedPatient) return setDispenseError('Please select a patient.')
    
    const currQty = parseInt(dispensingItem.quantity, 10) || 0
    // Only enforce stock limits if the drug is actually in inventory
    if (dispensingItem.id && qty > currQty) return setDispenseError(`Insufficient stock. Only ${currQty} left.`)
    if (dispensingItem.id && isExpired(dispensingItem)) return setDispenseError('This drug has expired.')

    setDispensing(true)
    try {
      let unitPrice = Number(dispensingItem.selling_price || 0)
      
      // NEW: If the drug is not in inventory (no ID), prompt for the price
      if (!dispensingItem.id) {
        const priceStr = prompt(`Enter price for ${dispensingItem.name} (₦):`, '0')
        unitPrice = parseFloat(priceStr) || 0
      }

      const newQty = dispensingItem.id ? (currQty - qty) : null
      const totalPrice = unitPrice * qty

      // 1. Reduce Stock (ONLY if it exists in inventory)
      if (dispensingItem.id) {
        await updateRecord(dispensingItem.id, { quantity: newQty, updated_at: new Date().toISOString() })
      }
      
      // 2. Record in Patient Profile
      await addStockRecord({ 
        patient_id: selectedPatient.id, patient_name: selectedPatient.full_name, 
        item_type: 'pharmacy', item_id: dispensingItem.id, item_name: dispensingItem.name, 
        quantity_used: qty, unit_price: unitPrice, total_price: totalPrice, created_by: profile?.id 
      })
      
      // 3. AUTOMATIC CHARGE GENERATION (Sent to Cashier Queue)
      await addBillableCharge({
        hospital_id: hospital.id, patient_id: selectedPatient.id, patient_name: selectedPatient.full_name,
        source_module: 'Pharmacy', source_transaction_id: `PHARM-${Date.now()}`,
        item_name: dispensingItem.name, category: 'Drug', quantity: qty, unit_price: unitPrice, total: totalPrice,
        status: 'pending', created_by: profile?.id
      })

      // 4. If this was from a Doctor's Order, mark prescription as dispensed
      if (activeRx) {
        await updatePrescription(activeRx.id, { status: 'dispensed' })
      }

      showToast(`${qty} ${dispensingItem.unit || 'units'} of ${dispensingItem.name} sent to Billing Queue.`)
      closeDispense()
      if (refreshTable) await refreshTable()
    } catch (err) { 
      setDispenseError(err.message || 'Failed to dispense.') 
    } finally { setDispensing(false) }
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 20, width: '100%' }}>
        <div className="dash-stat-card" style={{ minHeight: 110, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 58, height: 58, minWidth: 58, borderRadius: 14, background: 'var(--teal-soft)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="30" height="30"><path d="M9 3h6l1 4H8l1-4Z" /><path d="M6 7h12l-1 14H7L6 7Z" /></svg></div>
          <div><div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 5 }}>Total Drugs</div><div style={{ fontSize: 28, lineHeight: 1, fontWeight: 700 }}>{drugs.length}</div></div>
        </div>
        <div className="dash-stat-card" style={{ minHeight: 110, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 58, height: 58, minWidth: 58, borderRadius: 14, background: 'rgba(225,104,94,0.14)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="30" height="30"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg></div>
          <div><div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 5 }}>Low Stock</div><div style={{ fontSize: 28, lineHeight: 1, fontWeight: 700, color: lowStockCount > 0 ? 'var(--danger)' : 'var(--text)' }}>{lowStockCount}</div></div>
        </div>
        <div className="dash-stat-card" style={{ minHeight: 110, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 58, height: 58, minWidth: 58, borderRadius: 14, background: 'rgba(225,104,94,0.14)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="30" height="30"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></div>
          <div><div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 5 }}>Expired</div><div style={{ fontSize: 28, lineHeight: 1, fontWeight: 700, color: expiredCount > 0 ? 'var(--danger)' : 'var(--text)' }}>{expiredCount}</div></div>
        </div>
        <div className="dash-stat-card" style={{ minHeight: 110, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 58, height: 58, minWidth: 58, borderRadius: 14, background: 'rgba(212,175,55,0.14)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="30" height="30"><circle cx="12" cy="12" r="9" /><path d="M12 7v5" /><path d="M12 16h.01" /></svg></div>
          <div><div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 5 }}>Expiring Soon</div><div style={{ fontSize: 28, lineHeight: 1, fontWeight: 700 }}>{expiringSoonCount}</div></div>
        </div>
      </div>

      {/* DOCTOR'S PRESCRIPTION QUEUE */}
      <div className="dash-panel" style={{ marginBottom: 20, borderColor: 'var(--teal)' }}>
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title" style={{ color: 'var(--teal)' }}>Doctor's Prescription Queue</div>
            <div className="dash-panel-sub">Prescriptions automatically sent from the Doctor Workbench</div>
          </div>
        </div>
        {pendingRx.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>No pending prescriptions from doctors.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="dash-full-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Drug Prescribed</th>
                  <th>Dosage / Frequency</th>
                  <th>Doctor</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingRx.map(rx => (
                  <tr key={rx.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: 12, fontWeight: 700 }}>{rx.patient_name}</td>
                    <td style={{ padding: 12 }}>{rx.drug_name}</td>
                    <td style={{ padding: 12, fontSize: 12, color: 'var(--muted)' }}>{rx.dosage} · {rx.frequency}</td>
                    <td style={{ padding: 12, fontSize: 12 }}>{rx.doctor_name || '—'}</td>
                    <td style={{ padding: 12, display: 'flex', gap: 6 }}>
                      <button className="btn btn-primary" style={{ width: 'auto', padding: '6px 14px', fontSize: 12 }} onClick={() => openDispenseRx(rx)}>
                        Dispense
                      </button>
                      <button className="btn btn-ghost" style={{ width: 'auto', padding: '6px 14px', fontSize: 12, color: 'var(--danger)', border: '1px solid var(--danger)' }} onClick={() => handleCancelRx(rx)}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* EXISTING INVENTORY TABLE */}
      <div className="dash-panel">
        <div className="dash-panel-head">
          <div><div className="dash-panel-title">Pharmacy Inventory</div><div className="dash-panel-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? 'var(--teal)' : 'var(--danger)' }} />{isOnline ? 'Online' : 'Offline'}{pendingCount > 0 ? ` · ${pendingCount} syncing` : ''}{' · Auto-sends charges to Billing'}</div></div>
          <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search drug..." style={{ minWidth: 260, maxWidth: 420 }} />
        </div>
        {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</div> : visibleItems.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No drugs found.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="dash-full-table">
              <thead><tr>{['Drug', 'Batch', 'Expiry', 'Stock', 'Price', 'Status', ''].map(h => <th key={h} style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '0 12px 12px', textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {visibleItems.map(item => {
                  const q = Number(item.quantity || 0), r = Number(item.reorder_level || 0), low = q <= r, exp = isExpired(item), soon = isExpiringSoon(item)
                  return (
                    <tr key={item.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                      <td style={{ padding: 12, fontWeight: 700 }}>{item.name}</td>
                      <td style={{ padding: 12, fontSize: 11.5, color: 'var(--muted)' }}>{item.batch_number || '—'}</td>
                      <td style={{ padding: 12, fontSize: 12 }}><span style={{ color: exp ? 'var(--danger)' : soon ? 'var(--gold)' : 'var(--muted)', fontWeight: exp || soon ? 700 : 400 }}>{formatDate(item.expiry_date)}</span></td>
                      <td style={{ padding: 12 }}><span onClick={() => handleRestock(item)} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', background: low ? 'rgba(225,104,94,0.14)' : 'var(--teal-soft)', color: low ? 'var(--danger)' : 'var(--teal)' }}>{q} {item.unit || 'units'}</span></td>
                      <td style={{ padding: 12, fontSize: 12.5, color: 'var(--muted)' }}>{formatMoney(item.selling_price)}</td>
                      <td style={{ padding: 12 }}>{exp ? <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--danger)' }}>EXPIRED</span> : low ? <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--danger)' }}>LOW STOCK</span> : soon ? <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--gold)' }}>EXPIRING</span> : <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--teal)' }}>AVAILABLE</span>}</td>
                      <td style={{ padding: 12 }}>
                        <button className="btn btn-primary" style={{ width: 'auto', padding: '7px 12px', fontSize: 11, opacity: exp || q <= 0 ? 0.5 : 1 }} disabled={exp || q <= 0} onClick={() => openDispense(item)}>Dispense</button>
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
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{dispensingItem.id ? 'Available Stock & Price' : 'Not in Inventory (Manual Entry)'}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--teal)', marginTop: 3 }}>
                  {dispensingItem.id ? `${dispensingItem.quantity} ${dispensingItem.unit || 'units'}` : 'Enter Price on Confirm'}
                </div>
                {dispensingItem.id && <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>{formatMoney(dispensingItem.selling_price)} each</div>}
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
              <div className="field"><label>Quantity to Dispense</label><input type="number" min="1" value={dispenseQuantity} onChange={e => setDispenseQuantity(e.target.value)} placeholder="Enter quantity" /></div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button type="button" className="btn btn-ghost" onClick={closeDispense} disabled={dispensing}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={dispensing}>{dispensing ? 'Dispensing…' : 'Confirm Dispense'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 60 }}>{toast}</div>}
    </>
  )
}