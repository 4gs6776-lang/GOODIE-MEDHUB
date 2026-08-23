import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOfflineTable } from '../lib/useOfflineTable'

// ADDED 'Timeline' TO THE TABS LIST
const TABS = ['Overview', 'Timeline', 'History', 'Items Given', 'Prescriptions', 'Drug Chart', 'Pharmacy', 'Billing', 'Edit Info']

export default function PatientProfile({ patientId, onClose }){
  const { profile, hospital } = useAuth()
  const { records: patients, updateRecord: updatePatient, loadError: patientsLoadError } = useOfflineTable('patients', hospital?.id)
  const { records: vitals } = useOfflineTable('patient_vitals', hospital?.id)
  const { records: prescriptions, updateRecord: updatePrescription } = useOfflineTable('prescriptions', hospital?.id)
  const { records: pharmacyItems, updateRecord: updatePharmacyItem } = useOfflineTable('pharmacy_items', hospital?.id)
  const { records: invoices, addRecord: addInvoice, updateRecord: updateInvoice } = useOfflineTable('invoices', hospital?.id)
  const { records: admissionRequests } = useOfflineTable('admission_requests', hospital?.id)
  const { records: drugChartEntries, addRecord: addDrugChartEntry, updateRecord: updateDrugChartEntry, deleteRecord: deleteDrugChartEntry } = useOfflineTable('patient_drug_charts', hospital?.id)
  const { records: stockRecords } = useOfflineTable('patient_stock_records', hospital?.id)

  const [tab, setTab] = useState('Overview')
  const [toast, setToast] = useState(null)
  const patient = patients.find(p => p.id === patientId)

  const [loadTimedOut, setLoadTimedOut] = useState(false)
  useEffect(() => {
    setLoadTimedOut(false)
    const timer = setTimeout(() => setLoadTimedOut(true), 6000)
    return () => clearTimeout(timer)
  }, [patientId])

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  if (!patient) {
    return (
      <div style={overlayStyle}>
        <div style={{ ...panelStyle, textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
          {loadTimedOut ? (
            <>
              <div style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Couldn't load this patient</div>
              {patientsLoadError ? (
                <div style={{ fontSize: 12.5, marginBottom: 14, fontFamily: 'monospace', color: 'var(--danger)', wordBreak: 'break-word' }}>{patientsLoadError}</div>
              ) : (
                <div style={{ fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>No local error was reported, but the record for this patient wasn't found in local data.</div>
              )}
              <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 18, fontFamily: 'monospace', opacity: 0.7 }}>
                patient_id: {patientId || '—'}<br />hospital_id: {hospital?.id || '—'}<br />records loaded: {patients.length}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="btn btn-ghost" onClick={() => window.location.reload()}>Reload App</button>
                <button className="btn btn-ghost" onClick={onClose}>Close</button>
              </div>
            </>
          ) : (
            <>
              Loading patient…
              <div style={{ marginTop: 16 }}><button className="btn btn-ghost" onClick={onClose}>Close</button></div>
            </>
          )}
        </div>
      </div>
    )
  }

  const history = vitals
    .filter(v => v.patient_id === patient.id && v.status === 'completed')
    .sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at))

  const patientPrescriptions = prescriptions
    .filter(rx => rx.patient_name === patient.full_name)
    .sort((a, b) => new Date(b.prescribed_at || b.created_at) - new Date(a.prescribed_at || a.created_at))

  const activePrescriptions = patientPrescriptions.filter(rx => rx.status === 'active')

  const patientInvoices = invoices
    .filter(inv => inv.patient_id === patient.id || inv.patient_name === patient.full_name)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const outstandingBalance = patientInvoices.filter(inv => inv.status === 'unpaid').reduce((sum, inv) => sum + Number(inv.amount), 0)

  const patientDrugChart = drugChartEntries
    .filter(e => e.patient_id === patient.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const patientStockRecords = stockRecords
    .filter(r => r.patient_id === patient.id || r.patient_name === patient.full_name)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const activeAdmissionRequest = admissionRequests
    .filter(r => r.patient_id === patient.id && r.status !== 'cancelled' && r.status !== 'rejected')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null

  // NEW: Calculate Patient Timeline Events
  const timelineEvents = useMemo(() => {
    const events = [];
    if (patient?.created_at) events.push({ time: patient.created_at, title: 'Patient Registered', desc: 'Patient record created at reception.', color: 'var(--blue)' });
    vitals.filter(v => v.patient_id === patient.id).forEach(v => {
      if (v.status === 'waiting') events.push({ time: v.created_at, title: 'Triage / Vitals Taken', desc: `BP: ${v.blood_pressure || '—'}, Temp: ${v.temperature || '—'}°C`, color: 'var(--violet)' });
      if (v.status === 'completed' && v.completed_at) events.push({ time: v.completed_at, title: 'Doctor Consultation', desc: `Diagnosis: ${v.diagnosis || 'N/A'}`, color: 'var(--teal)' });
    });
    patientPrescriptions.forEach(rx => events.push({ time: rx.prescribed_at || rx.created_at, title: 'Prescription Issued', desc: `Drug: ${rx.drug_name} (${rx.dosage})`, color: 'var(--gold)' }));
    patientStockRecords.forEach(r => events.push({ time: r.created_at, title: 'Item Dispensed', desc: `${r.quantity_used} units of ${r.item_name} given.`, color: 'var(--gold)' }));
    patientInvoices.forEach(inv => events.push({ time: inv.created_at, title: 'Invoice Generated', desc: `Amount: ₦${Number(inv.amount).toLocaleString()} - Status: ${inv.status}`, color: inv.status === 'paid' ? 'var(--teal)' : 'var(--danger)' }));
    return events.sort((a, b) => new Date(b.time) - new Date(a.time));
  }, [patient, vitals, patientPrescriptions, patientStockRecords, patientInvoices]);

  function findPharmacyMatch(drugName){
    if (!drugName) return null
    const q = drugName.toLowerCase()
    return pharmacyItems.find(item => { const n = item.name.toLowerCase(); return n.includes(q) || q.includes(n) }) || null
  }

  async function handleDispense(rx){
    const match = findPharmacyMatch(rx.drug_name)
    if (match && Number(match.quantity) > 0) {
      await updatePharmacyItem(match.id, { quantity: Number(match.quantity) - 1 })
    }
    await updatePrescription(rx.id, { status: 'dispensed' })
    showToast(match ? `Dispensed ${rx.drug_name} — ${Math.max(Number(match.quantity) - 1, 0)} left in stock` : `Dispensed ${rx.drug_name}`)
  }