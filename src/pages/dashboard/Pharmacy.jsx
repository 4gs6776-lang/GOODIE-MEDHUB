import { useState, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import { useRealtimeAlert } from '../../lib/useRealtimeAlert'
import { usePagination } from '../../lib/usePagination'
import Pagination from '../../components/common/Pagination'
import SearchInput from '../../components/common/SearchInput'
import AppIcon from '../../components/icons'
import ConnectionState from '../../components/common/ConnectionState'
import PatientAutocomplete from '../../components/common/PatientAutocomplete'
import WalkInSaleModal from '../../components/pharmacy/WalkInSaleModal'
import useMediaQuery from '../../lib/useMediaQuery'
import { getTimezone, formatDate as formatDateTz, formatDateTime } from '../../lib/datetime'
import { writeAudit } from '../../lib/audit'
import { ROLE_LABELS } from '../../lib/permissions'
import { effectiveQty, parseRxQuantity, rxSummary } from '../../lib/pharmacyRequests'

export default function Pharmacy() {
  const { profile, hospital } = useAuth()
  const timezone = getTimezone(hospital)
  // Batch-2 QA: phones re-flow both tables into record cards instead of
  // force-scrolling 5–7 nowrap columns inside a 320–430px screen.
  const isPhone = useMediaQuery('(max-width: 767px)')
  const { records: inventoryItems, loading, isOnline, pendingCount, updateRecord, refreshTable } = useOfflineTable('inventory_items', hospital?.id)
  const { records: patients } = useOfflineTable('patients', hospital?.id)
  const { addRecord: addStockRecord } = useOfflineTable('patient_stock_records', hospital?.id)
  const { addRecord: addBillableCharge } = useOfflineTable('billable_charges', hospital?.id)
  
  // NEW: Fetch prescriptions to receive doctor's orders
  const { records: prescriptions, updateRecord: updatePrescription, syncFromServer: syncPrescriptions } = useOfflineTable('prescriptions', hospital?.id)
  // Requests staff have sent from patient profiles / the nursing station
  const { records: pharmRequests, updateRecord: updateRequest, syncFromServer: syncRequests } = useOfflineTable('pharmacy_requests', hospital?.id)
  const [toast, setToast] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showDispenseModal, setShowDispenseModal] = useState(false)
  const [dispensingItem, setDispensingItem] = useState(null)
  const [dispenseQuantity, setDispenseQuantity] = useState('')
  const [dispensing, setDispensing] = useState(false)
  const [dispenseError, setDispenseError] = useState('')
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [activeRx, setActiveRx] = useState(null) // Tracks if dispensing from a doctor's order
  const [activeReq, setActiveReq] = useState(null) // Tracks if dispensing a staff request
  const [pharmTab, setPharmTab] = useState('queue') // 'queue' | 'inventory' | 'sales'
  const [showWalkInModal, setShowWalkInModal] = useState(false)
  const [salesRefreshKey, setSalesRefreshKey] = useState(0)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  // Live alert — the instant a doctor finalizes a prescription anywhere
  // in the hospital, show a toast here and pull the fresh record down.
  useRealtimeAlert('prescriptions', hospital?.id, (newRow) => {
    if (newRow.status === 'active') {
      // Plain text — no emoji as icons (unified icon system, req. #12).
      showToast(`New prescription received for ${newRow.patient_name || 'a patient'}`)
      syncPrescriptions()
    }
  })
  
  // Live alert when a nurse / staff member sends a request
  useRealtimeAlert('pharmacy_requests', hospital?.id, (row) => {
    if (row.status === 'requested') {
      showToast(`${row.requested_by_name || 'Staff'} requested ${row.quantity} × ${row.drug_name} for ${row.patient_name || 'a patient'}`)
      if (syncRequests) syncRequests()
    }
  })
  const openRequests = pharmRequests.filter(r => r.status === 'requested').sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  // Doctor's Prescription Queue
  const pendingRx = prescriptions.filter(p => p.status === 'active').sort((a,b) => new Date(a.prescribed_at) - new Date(b.prescribed_at))
  
  const drugs = inventoryItems.filter(item => String(item.category || '').trim().toLowerCase() === 'drug')
  const visibleItems = searchTerm.trim() ? drugs.filter(item => [item.name, item.generic_name, item.strength, item.batch_number].some(v => String(v || '').toLowerCase().includes(searchTerm.toLowerCase()))) : drugs
  const lowStockCount = drugs.filter(item => Number(item.quantity || 0) <= Number(item.reorder_level || 0)).length
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const expiredCount = drugs.filter(item => { if (!item.expiry_date) return false; const e = new Date(item.expiry_date); e.setHours(0,0,0,0); return e < today }).length
  const expiringSoonCount = drugs.filter(item => { if (!item.expiry_date) return false; const e = new Date(item.expiry_date); e.setHours(0,0,0,0); const d = (e.getTime() - today.getTime()) / (1000*60*60*24); return d >= 0 && d <= 30 }).length

  const formatMoney = (v) => '₦' + Number(v || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // Delegates to the centralized date utility with the hospital timezone (req. #11)
  const formatDate = (v) => formatDateTz(v, timezone)
  const isExpired = (item) => { if (!item.expiry_date) return false; const e = new Date(item.expiry_date); e.setHours(0,0,0,0); return e < today }
  const isExpiringSoon = (item) => { if (!item.expiry_date) return false; const e = new Date(item.expiry_date); e.setHours(0,0,0,0); const d = (e.getTime() - today.getTime()) / (1000*60*60*24); return d >= 0 && d <= 30 }

  const handleRestock = async (item) => {
    const input = prompt(`Current stock: ${item.quantity} ${item.unit}\n\nEnter new quantity:`, item.quantity)
    if (input === null) return
    const newQ = parseInt(input, 10)
    if (isNaN(newQ) || newQ < 0) return showToast('Invalid quantity')
    try {
      await updateRecord(item.id, { quantity: newQ, updated_at: new Date().toISOString() })
      writeAudit({
        hospitalId: hospital?.id, actor: profile,
        action: 'pharmacy.restock',
        entityType: 'inventory_item', entityId: item.id,
        summary: `Pharmacy restock — ${item.name}: ${item.quantity} → ${newQ} ${item.unit || 'units'}`,
        metadata: { item_name: item.name, batch_number: item.batch_number || null, from: item.quantity, to: newQ, unit: item.unit || 'units' },
      })
      showToast('Stock updated')
    } catch (e) {
      showToast(e.message)
    }
  }

  /* ---- Phone card layouts (Batch-2 QA) ------------------------------
     Same information as the desktop tables, re-flowed for 320–430px.
     Rendered only when isPhone — no duplicated hidden DOM. */
  function RxCard({ rx }) {
    return (
      <div className="appt-card">
        <div className="appt-card-top">
          <span className="appt-card-time" style={{ background: 'rgba(139,124,246,0.14)', color: 'var(--violet)', fontSize: 10 }}>RX</span>
          <div className="appt-card-id-block">
            <div className="appt-card-name">{rx.patient_name}</div>
            <div className="appt-card-meta">{rx.drug_name} · {rx.dosage} · {rx.frequency}</div>
            {rx.doctor_name && <div className="appt-card-meta">Dr. {rx.doctor_name.replace(/^Dr\.?\s*/i, '')}</div>}
          </div>
        </div>
        <div className="appt-card-foot">
          <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 16px', fontSize: 12 }} onClick={() => openDispenseRx(rx)}>Dispense</button>
          <button className="btn btn-ghost" style={{ width: 'auto', padding: '8px 14px', fontSize: 12, color: 'var(--danger)', border: '1px solid var(--danger)' }} onClick={() => handleCancelRx(rx)}>Cancel</button>
        </div>
      </div>
    )
  }

  function DrugCard({ item }) {
    const q = Number(item.quantity || 0), r = Number(item.reorder_level || 0), low = q <= r, exp = isExpired(item), soon = isExpiringSoon(item)
    const statusNode = exp
      ? <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--danger)' }}>EXPIRED</span>
      : low ? <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--danger)' }}>LOW STOCK</span>
      : soon ? <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--gold)' }}>EXPIRING</span>
      : <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--teal)' }}>AVAILABLE</span>
    return (
      <div className="appt-card">
        <div className="appt-card-top">
          <span
            className="appt-card-time"
            style={{ background: low ? 'rgba(225,104,94,0.14)' : 'var(--teal-soft)', color: low ? 'var(--danger)' : 'var(--teal)', fontSize: 10, cursor: 'pointer' }}
            onClick={() => handleRestock(item)}
            role="button"
            aria-label={`Stock ${q} ${item.unit || 'units'}. Tap to restock ${item.name}`}
            title="Tap to restock"
          >{q}</span>
          <div className="appt-card-id-block">
            <div className="appt-card-name">{item.name}</div>
            <div className="appt-card-meta">
              Batch {item.batch_number || '—'} · Exp {formatDate(item.expiry_date)}
            </div>
            <div className="appt-card-meta">{formatMoney(item.selling_price)} · {item.unit || 'units'}</div>
          </div>
        </div>
        <div className="appt-card-foot">
          {statusNode}
          <button
            className="btn btn-primary"
            style={{ width: 'auto', padding: '8px 16px', fontSize: 12, opacity: exp || q <= 0 ? 0.5 : 1 }}
            disabled={exp || q <= 0}
            onClick={() => openDispense(item)}
          >Dispense</button>
        </div>
      </div>
    )
  }

  // Manual Dispense (Over the counter)
  const openDispense = (item) => { 
    setDispensingItem(item); setDispenseQuantity(''); setDispenseError(''); setSelectedPatient(null); setActiveRx(null); setActiveReq(null); setShowDispenseModal(true) 
  }

  // NEW: Cancel Prescription from Doctor's Queue
  async function handleCancelRx(rx) {
    if (!confirm(`Cancel prescription for ${rx.drug_name}?`)) return
    try {
      await updatePrescription(rx.id, { status: 'cancelled' })
      writeAudit({
        hospitalId: hospital?.id, actor: profile,
        action: 'prescription.cancelled',
        entityType: 'prescription', entityId: rx.id, patientId: rx.patient_id || null,
        summary: `Cancelled prescription — ${rx.drug_name} for ${rx.patient_name || 'patient'}`,
        metadata: {
          drug_name: rx.drug_name, dosage: rx.dosage || null, frequency: rx.frequency || null,
          patient_name: rx.patient_name || null, doctor_name: rx.doctor_name || null,
          prescribed_at: rx.prescribed_at || null,
        },
      })
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
    setSelectedPatient(matchedPatient)
    setActiveRx(rx) // Link this dispense to the doctor's prescription
    setShowDispenseModal(true)
  }

  // Dispense a staff request (pre-filled with who asked for what)
  const openDispenseRequest = (req) => {
    const wanted = String(req.drug_name || '').toLowerCase()
    const matchedDrug = inventoryItems.find(it =>
      String(it.name || '').toLowerCase() === wanted || String(it.generic_name || '').toLowerCase() === wanted
    )
    const matchedPatient = patients.find(p => p.id === req.patient_id)
    if (!matchedPatient) return showToast('Patient record not found.')
    if (!matchedDrug) {
      setDispensingItem({ id: null, name: req.drug_name, quantity: 9999, unit: 'units', selling_price: 0, expiry_date: null })
      showToast(`"${req.drug_name}" is not in inventory. Please enter price manually.`)
    } else {
      setDispensingItem(matchedDrug)
    }
    setDispenseQuantity(String(req.quantity))
    setDispenseError('')
    setSelectedPatient(matchedPatient)
    setActiveRx(prescriptions.find(p => p.id === req.prescription_id) || null)
    setActiveReq(req)
    setShowDispenseModal(true)
  }

  async function handleRejectRequest(req) {
    if (!confirm(`Reject the request for ${req.quantity} × ${req.drug_name}? The quantity goes back to the prescription.`)) return
    try {
      await updateRequest(req.id, { status: 'cancelled', cancelled_by_name: profile?.full_name || null, cancelled_at: new Date().toISOString() })
      writeAudit({
        hospitalId: hospital?.id, actor: profile,
        action: 'pharmacy.request_rejected',
        entityType: 'prescription', entityId: req.prescription_id || null, patientId: req.patient_id || null,
        summary: `Rejected request for ${req.quantity} × ${req.drug_name} (${req.patient_name || 'patient'}), asked by ${req.requested_by_name || 'staff'}`,
        metadata: { request_id: req.id, drug_name: req.drug_name, quantity: req.quantity, requested_by_name: req.requested_by_name || null },
      })
      showToast('Request rejected')
    } catch (err) {
      showToast(err.message || 'Failed to reject')
    }
  }

  const closeDispense = () => { 
    if (dispensing) return
    setShowDispenseModal(false); setDispensingItem(null); setDispenseQuantity(''); setDispenseError(''); setSelectedPatient(null); setActiveRx(null); setActiveReq(null) 
  }

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
      if (activeReq) {
        // Mark this staff request as given...
        await updateRequest(activeReq.id, {
          status: 'dispensed', dispensed_quantity: qty,
          dispensed_by: profile?.id || null, dispensed_by_name: profile?.full_name || null,
          dispensed_at: new Date().toISOString(),
        })
        // ...and finish the prescription only when everything prescribed has been given.
        if (activeRx) {
          const total = parseRxQuantity(activeRx.quantity)
          const givenBefore = pharmRequests
            .filter(r => r.prescription_id === activeRx.id && r.id !== activeReq.id && r.status === 'dispensed')
            .reduce((sum, r) => sum + effectiveQty(r), 0)
          if (total == null || givenBefore + qty >= total) {
            await updatePrescription(activeRx.id, { status: 'dispensed' })
          }
        }
      } else if (activeRx) {
        await updatePrescription(activeRx.id, { status: 'dispensed' })
      }

      // 5. Audit trail — dispense event.
      //    One audit row regardless of whether this was an OTC dispense or
      //    a doctor's-order dispense; the `from_prescription` flag and the
      //    optional `prescription_id` in metadata distinguish the two.
      writeAudit({
        hospitalId: hospital?.id, actor: profile,
        action: activeRx ? 'prescription.dispensed' : 'pharmacy.dispense_otc',
        entityType: activeRx ? 'prescription' : 'inventory_item',
        entityId: activeRx?.id || dispensingItem.id || null,
        patientId: selectedPatient.id,
        summary: `Dispensed ${qty} ${dispensingItem.unit || 'units'} of ${dispensingItem.name} to ${selectedPatient.full_name}`,
        metadata: {
          item_name: dispensingItem.name,
          item_id: dispensingItem.id || null,
          quantity: qty,
          unit: dispensingItem.unit || 'units',
          unit_price: unitPrice,
          total_price: totalPrice,
          from_prescription: Boolean(activeRx),
          request_id: activeReq?.id || null,
          requested_by_name: activeReq?.requested_by_name || null,
          prescription_id: activeRx?.id || null,
          doctor_name: activeRx?.doctor_name || null,
          stock_before: dispensingItem.id ? currQty : null,
          stock_after: dispensingItem.id ? newQty : null,
        },
      })

      showToast(`${qty} ${dispensingItem.unit || 'units'} of ${dispensingItem.name} sent to Billing Queue.`)
      closeDispense()
      if (refreshTable) await refreshTable()
    } catch (err) { 
      setDispenseError(err.message || 'Failed to dispense.') 
    } finally { setDispensing(false) }
  }

  // Global Pagination Rule — the pharmacy drug catalogue can run into
  // the hundreds of SKUs; only the current page of the search results
  // gets rendered (both desktop table and phone card list use this).
  const {
    pageItems: pagedItems, currentPage, setCurrentPage, pageSize, setPageSize,
    totalPages, totalItems, startIndex, endIndex,
  } = usePagination(visibleItems, { pageSize: 20, resetKey: searchTerm })

  return (
    <>
      {/* Stats — shared .dash-stats grid */}
      <div className="dash-stats" style={{ marginBottom: 20 }}>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}><AppIcon name="pill" size={20} /></div>
          <div>
            <div className="dash-stat-label">Total Drugs</div>
            <div className="dash-stat-value">{drugs.length}</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(225,104,94,0.14)', color: 'var(--danger)' }}><AppIcon name="arrowDown" size={20} /></div>
          <div>
            <div className="dash-stat-label">Low Stock</div>
            <div className="dash-stat-value" style={{ color: lowStockCount > 0 ? 'var(--danger)' : 'var(--text)' }}>{lowStockCount}</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(225,104,94,0.14)', color: 'var(--danger)' }}><AppIcon name="clock" size={20} /></div>
          <div>
            <div className="dash-stat-label">Expired</div>
            <div className="dash-stat-value" style={{ color: expiredCount > 0 ? 'var(--danger)' : 'var(--text)' }}>{expiredCount}</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(212,175,55,0.14)', color: 'var(--gold)' }}><AppIcon name="calendar" size={20} /></div>
          <div>
            <div className="dash-stat-label">Expiring Soon</div>
            <div className="dash-stat-value">{expiringSoonCount}</div>
          </div>
        </div>
      </div>

      {/* ---- Tab switcher: Queue / Walk-in Sale / Inventory / Sales History ---- */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { key: 'queue', label: 'Prescription Queue' },
          { key: 'walkin', label: 'Walk-in Sale' },
          { key: 'inventory', label: 'Pharmacy Inventory' },
          { key: 'sales', label: 'Sales History' },
        ].map(t => (
          <button
            key={t.key}
            type="button"
            className={`btn ${pharmTab === t.key ? 'btn-primary' : 'btn-ghost'}`}
            style={{ width: 'auto', padding: '8px 14px', fontSize: 12.5 }}
            onClick={() => { setPharmTab(t.key); if (t.key === 'walkin') setShowWalkInModal(true) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* DOCTOR'S PRESCRIPTION QUEUE */}
      {pharmTab === 'queue' && (
      <>
      {/* Staff medication requests: who asked for what, for which patient */}
      {openRequests.length > 0 && (
        <div className="dash-panel" style={{ marginBottom: 20 }}>
          <div className="dash-panel-head">
            <div>
              <div className="dash-panel-title">Staff Medication Requests ({openRequests.length})</div>
              <div className="dash-panel-sub">Sent from patient profiles and the nursing station</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {openRequests.map(req => {
              const rx = prescriptions.find(p => p.id === req.prescription_id)
              const sum = rx ? rxSummary(rx, pharmRequests) : null
              const when = req.created_at ? new Date(req.created_at).toLocaleString('en-GB', { timeZone: timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
              const badge = { fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--warning-soft)', color: 'var(--warning)' }
              return (
                <div key={req.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{req.quantity} × {req.drug_name}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>for {req.patient_name || 'patient'}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      Requested by <b style={{ color: 'var(--ivory)' }}>{req.requested_by_name || 'Staff'}</b>
                      {req.requested_by_role ? ` (${ROLE_LABELS[req.requested_by_role] || req.requested_by_role})` : ''}{when ? ` · ${when}` : ''}
                    </div>
                    {sum && sum.total != null && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        Prescription: {sum.total} prescribed · {sum.requested} requested · {Math.max(0, sum.remaining)} left
                      </div>
                    )}
                    {req.notes && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Note: {req.notes}</div>}
                    {(req.not_prescribed || req.exceeds_remaining) && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        {req.not_prescribed && <span style={badge}>Not prescribed</span>}
                        {req.exceeds_remaining && <span style={badge}>More than prescribed</span>}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 16px', fontSize: 12 }} onClick={() => openDispenseRequest(req)}>Dispense</button>
                    <button className="btn btn-ghost" style={{ width: 'auto', padding: '8px 14px', fontSize: 12, color: 'var(--danger)', border: '1px solid var(--danger)' }} onClick={() => handleRejectRequest(req)}>Reject</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="dash-panel" style={{ marginBottom: 20, borderColor: 'var(--teal)' }}>
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title" style={{ color: 'var(--teal)' }}>Doctor's Prescription Queue</div>
            <div className="dash-panel-sub">Prescriptions automatically sent from the Doctor Workbench</div>
          </div>
        </div>
        {pendingRx.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>No pending prescriptions from doctors.</div>
        ) : isPhone ? (
          <div className="appt-list" style={{ padding: '4px 0 12px' }}>
            {pendingRx.map(rx => <RxCard key={rx.id} rx={rx} />)}
          </div>
        ) : (
          <div className="dash-table-wrap">
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
                    <td style={{ padding: 12 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary" style={{ width: 'auto', padding: '6px 14px', fontSize: 12 }} onClick={() => openDispenseRx(rx)}>
                          Dispense
                        </button>
                        <button className="btn btn-ghost" style={{ width: 'auto', padding: '6px 14px', fontSize: 12, color: 'var(--danger)', border: '1px solid var(--danger)' }} onClick={() => handleCancelRx(rx)}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {/* EXISTING INVENTORY TABLE — shown when pharmTab === 'inventory' */}
      {pharmTab === 'inventory' && (
      <div className="dash-panel">
        <div className="dash-panel-head">
          <div><div className="dash-panel-title">Pharmacy Inventory</div><div className="dash-panel-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><ConnectionState isOnline={isOnline} pendingCount={pendingCount} />{' · Auto-sends charges to Billing'}</div></div>
          <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search drug..." style={{ minWidth: 260, maxWidth: 420 }} />
        </div>
        {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</div> : visibleItems.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No drugs found.</div> : (
          <>
            {isPhone ? (
              <div className="appt-list" style={{ padding: '4px 0 12px' }}>
                {pagedItems.map(item => <DrugCard key={item.id} item={item} />)}
              </div>
            ) : (
              <div className="dash-table-wrap">
                <table className="dash-full-table">
                  <thead><tr>{['Drug', 'Batch', 'Expiry', 'Stock', 'Price', 'Status', ''].map(h => <th key={h} style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '0 12px 12px', textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {pagedItems.map(item => {
                      const q = Number(item.quantity || 0), r = Number(item.reorder_level || 0), low = q <= r, exp = isExpired(item), soon = isExpiringSoon(item)
                      return (
                        <tr key={item.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                          <td style={{ padding: 12, fontWeight: 700 }}>{item.name}</td>
                          <td style={{ padding: 12, fontSize: 11.5, color: 'var(--muted)' }}>{item.batch_number || '—'}</td>
                          <td style={{ padding: 12, fontSize: 12 }}><span style={{ color: exp ? 'var(--danger)' : soon ? 'var(--gold)' : 'var(--muted)', fontWeight: exp || soon ? 700 : 400 }}>{formatDate(item.expiry_date)}</span></td>
                          <td style={{ padding: 12 }}>
                            <button
                              type="button"
                              onClick={() => handleRestock(item)}
                              className="appt-status-btn"
                              style={{ fontSize: 11, fontWeight: 700, background: low ? 'rgba(225,104,94,0.14)' : 'var(--teal-soft)', color: low ? 'var(--danger)' : 'var(--teal)' }}
                              title="Tap to restock"
                              aria-label={`Stock ${q} ${item.unit || 'units'}. Tap to restock ${item.name}`}
                            >{q} {item.unit || 'units'}</button>
                          </td>
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

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              startIndex={startIndex}
              endIndex={endIndex}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              itemLabel="drugs"
            />
          </>
        )}
      </div>
      )}

      {/* ---- Sales History tab ---- */}
      {pharmTab === 'sales' && <SalesHistory hospital={hospital} timezone={timezone} refreshKey={salesRefreshKey} />}

      {/* ---- Walk-in Sale modal ---- */}
      {showWalkInModal && (
        <WalkInSaleModal
          hospital={hospital}
          profile={profile}
          onClose={() => setShowWalkInModal(false)}
          onSaleComplete={() => { setSalesRefreshKey(k => k + 1); setPharmTab('sales') }}
        />
      )}

      {showDispenseModal && dispensingItem && (
        /* Shared modal chrome → bottom sheet with pinned actions on phones */
        <div className="dash-modal-backdrop">
          <div className="card dash-modal" style={{ maxWidth: 420 }}>
            <div className="dash-modal-title">Dispense Medication</div>
            <form onSubmit={handleDispense}>
              <div className="dash-modal-body">
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>{dispensingItem.name}</div>
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
            <div className="field">
                <label>Select Patient</label>
                <PatientAutocomplete
                  patients={patients}
                  value={selectedPatient ? { id: selectedPatient.id, label: selectedPatient.full_name, patient: selectedPatient } : null}
                  onChange={opt => setSelectedPatient(opt?.patient || null)}
                  placeholder="Search patient name…"
                  ariaLabel="Patient"
                />
              </div>
              <div className="field"><label>Quantity to Dispense</label><input type="number" min="1" value={dispenseQuantity} onChange={e => setDispenseQuantity(e.target.value)} placeholder="Enter quantity" /></div>
            </div>
            <div className="dash-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={closeDispense} disabled={dispensing}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={dispensing}>{dispensing ? 'Dispensing…' : 'Confirm Dispense'}</button>
            </div>
          </form>
          </div>
        </div>
      )}
      {toast && <div className="dash-toast dash-toast-success">{toast}</div>}
    </>
  )
}

// =====================================================================
// SalesHistory — paginated list of pharmacy_sales
// =====================================================================
function SalesHistory({ hospital, timezone, refreshKey }) {
  const { records: sales, loading } = useOfflineTable('pharmacy_sales', hospital?.id)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const filtered = useMemo(() => {
    let arr = [...sales].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    if (typeFilter !== 'all') arr = arr.filter(s => s.sale_type === typeFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      arr = arr.filter(s =>
        String(s.sale_number || '').toLowerCase().includes(q) ||
        String(s.customer_name || '').toLowerCase().includes(q) ||
        String(s.payment_method || '').toLowerCase().includes(q)
      )
    }
    return arr
  }, [sales, typeFilter, search, refreshKey])

  const todayStr = new Date().toDateString()
  const todaySales = filtered.filter(s => new Date(s.created_at).toDateString() === todayStr)
  const todayRevenue = todaySales.reduce((sum, s) => sum + Number(s.total || 0), 0)

  const {
    pageItems: pagedSales, currentPage, setCurrentPage, pageSize, setPageSize,
    totalPages, totalItems, startIndex, endIndex,
  } = usePagination(filtered, { pageSize: 15, resetKey: `${search}|${typeFilter}|${refreshKey}` })

  const formatMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <>
      {/* Mini stats */}
      <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}><AppIcon name="billing" size={18} /></div>
          <div><div className="dash-stat-label">Today's Sales</div><div className="dash-stat-value" style={{ fontSize: 16 }}>{formatMoney(todayRevenue)}</div><div className="dash-stat-delta">{todaySales.length} sale(s)</div></div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(118,87,232,0.14)', color: 'var(--violet)' }}><AppIcon name="users" size={18} /></div>
          <div><div className="dash-stat-label">Total Sales</div><div className="dash-stat-value" style={{ fontSize: 16 }}>{filtered.length}</div></div>
        </div>
      </div>

      <div className="dash-panel">
        <div className="dash-panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div><div className="dash-panel-title">Pharmacy Sales History</div><div className="dash-panel-sub">Walk-in sales and prescription dispensing records</div></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)', fontSize: 12.5 }}>
              <option value="all">All types</option>
              <option value="walk_in">Walk-in</option>
              <option value="prescription">Prescription</option>
            </select>
            <SearchInput value={search} onChange={setSearch} placeholder="Search sale #, customer…" style={{ minWidth: 200, maxWidth: 320 }} />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>Loading sales…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>No sales recorded yet. Click "Walk-in Sale" to make your first sale.</div>
        ) : (
          <>
            <div className="dash-table-wrap">
              <table className="dash-full-table">
                <thead><tr><th>Sale #</th><th>Date / Time</th><th>Customer</th><th>Type</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Staff</th></tr></thead>
                <tbody>
                  {pagedSales.map(s => (
                    <tr key={s.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                      <td style={{ padding: 12, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{s.sale_number || '—'}</td>
                      <td style={{ padding: 12, fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{s.created_at ? formatDateTime(s.created_at, timezone) : '—'}</td>
                      <td style={{ padding: 12, fontWeight: 700 }}>{s.customer_name || '—'}</td>
                      <td style={{ padding: 12 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: s.sale_type === 'walk_in' ? 'rgba(0,199,199,0.14)' : 'rgba(118,87,232,0.14)', color: s.sale_type === 'walk_in' ? 'var(--teal)' : 'var(--violet)', textTransform: 'uppercase' }}>
                          {s.sale_type === 'walk_in' ? 'Walk-in' : 'Rx'}
                        </span>
                      </td>
                      <td style={{ padding: 12, fontSize: 12.5 }}>{Array.isArray(s.items) ? s.items.length : 0} item(s)</td>
                      <td style={{ padding: 12, fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--teal)' }}>{formatMoney(s.total)}</td>
                      <td style={{ padding: 12, fontSize: 11.5, color: 'var(--muted)' }}>{s.payment_method || '—'}</td>
                      <td style={{ padding: 12 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: s.status === 'completed' ? 'rgba(24,217,155,0.14)' : s.status === 'refunded' ? 'rgba(240,79,95,0.14)' : 'rgba(154,170,183,0.14)', color: s.status === 'completed' ? 'var(--mint)' : s.status === 'refunded' ? 'var(--danger)' : 'var(--muted)', textTransform: 'uppercase' }}>
                          {s.status}
                        </span>
                      </td>
                      <td style={{ padding: 12, fontSize: 11.5, color: 'var(--muted)' }}>{s.dispensed_by_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={currentPage} totalPages={totalPages} totalItems={totalItems}
              startIndex={startIndex} endIndex={endIndex} pageSize={pageSize}
              onPageChange={setCurrentPage} onPageSizeChange={setPageSize}
              itemLabel="sales"
            />
          </>
        )}
      </div>
    </>
  )
}
