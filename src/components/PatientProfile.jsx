import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOfflineTable } from '../lib/useOfflineTable'

const TABS = ['Overview', 'History', 'Items Given', 'Prescriptions', 'Drug Chart', 'Pharmacy', 'Billing', 'Edit Info']

// Full-screen patient dashboard, opened by clicking a patient anywhere in
// the app. Reuses the same offline-first tables every other module reads —
// nothing new is stored here except through those existing hooks.
export default function PatientProfile({ patientId, onClose }){
  const { profile, hospital } = useAuth()
  const { records: patients, updateRecord: updatePatient, loadError: patientsLoadError } = useOfflineTable('patients', hospital?.id)
  const { records: vitals } = useOfflineTable('patient_vitals', hospital?.id)
  const { records: prescriptions, updateRecord: updatePrescription } = useOfflineTable('prescriptions', hospital?.id)
  const { records: pharmacyItems, updateRecord: updatePharmacyItem } = useOfflineTable('pharmacy_items', hospital?.id)
  const { records: invoices, addRecord: addInvoice, updateRecord: updateInvoice } = useOfflineTable('invoices', hospital?.id)
  const { records: admissionRequests } = useOfflineTable('admission_requests', hospital?.id)
  const { records: drugChartEntries, addRecord: addDrugChartEntry, updateRecord: updateDrugChartEntry, deleteRecord: deleteDrugChartEntry } = useOfflineTable('patient_drug_charts', hospital?.id)
  
  // NEW: Fetch the stock records (Items Given)
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
              <div style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                Couldn't load this patient
              </div>
              {patientsLoadError ? (
                <div style={{ fontSize: 12.5, marginBottom: 14, fontFamily: 'monospace', color: 'var(--danger)', wordBreak: 'break-word' }}>
                  {patientsLoadError}
                </div>
              ) : (
                <div style={{ fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
                  No local error was reported, but the record for this patient wasn't found in local data.
                </div>
              )}
              <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 18, fontFamily: 'monospace', opacity: 0.7 }}>
                patient_id: {patientId || '—'}<br />
                hospital_id: {hospital?.id || '—'}<br />
                records loaded: {patients.length}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="btn btn-ghost" onClick={() => window.location.reload()}>Reload App</button>
                <button className="btn btn-ghost" onClick={onClose}>Close</button>
              </div>
            </>
          ) : (
            <>
              Loading patient…
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-ghost" onClick={onClose}>Close</button>
              </div>
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

  // NEW: Filter stock records for this patient
  const patientStockRecords = stockRecords
    .filter(r => r.patient_id === patient.id || r.patient_name === patient.full_name)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const activeAdmissionRequest = admissionRequests
    .filter(r => r.patient_id === patient.id && r.status !== 'cancelled' && r.status !== 'rejected')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null

  function findPharmacyMatch(drugName){
    if (!drugName) return null
    const q = drugName.toLowerCase()
    return pharmacyItems.find(item => {
      const n = item.name.toLowerCase()
      return n.includes(q) || q.includes(n)
    }) || null
  }

  async function handleDispense(rx){
    const match = findPharmacyMatch(rx.drug_name)
    if (match && Number(match.quantity) > 0) {
      await updatePharmacyItem(match.id, { quantity: Number(match.quantity) - 1 })
    }
    await updatePrescription(rx.id, { status: 'dispensed' })
    showToast(match ? `Dispensed ${rx.drug_name} — ${Math.max(Number(match.quantity) - 1, 0)} left in stock` : `Dispensed ${rx.drug_name}`)
  }

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '18px 20px', borderBottom: '1px solid var(--line-soft)' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{patient.full_name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {patient.age ? `${patient.age} yrs` : ''}{patient.gender ? ` · ${patient.gender}` : ''}{patient.hospital_number ? ` · #${patient.hospital_number}` : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', flexShrink: 0 }}
          >✕</button>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '12px 20px 0', overflowX: 'auto' }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flexShrink: 0, padding: '7px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: tab === t ? '1px solid var(--teal)' : '1px solid var(--line)',
                background: tab === t ? 'var(--teal-soft)' : 'transparent',
                color: tab === t ? 'var(--teal)' : 'var(--muted)',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          {tab === 'Overview' && (
            <OverviewTab patient={patient} latestConsultation={history[0]} activePrescriptions={activePrescriptions} outstandingBalance={outstandingBalance} admissionRequest={activeAdmissionRequest} />
          )}
          {tab === 'History' && <HistoryTab history={history} />}
          {tab === 'Items Given' && <ItemsGivenTab records={patientStockRecords} />}
          {tab === 'Prescriptions' && <PrescriptionsTab prescriptions={patientPrescriptions} />}
          {tab === 'Drug Chart' && (
            <DrugChartTab
              patient={patient}
              entries={patientDrugChart}
              profile={profile}
              addEntry={addDrugChartEntry}
              updateEntry={updateDrugChartEntry}
              deleteEntry={deleteDrugChartEntry}
              showToast={showToast}
            />
          )}
          {tab === 'Pharmacy' && (
            <PharmacyTab activePrescriptions={activePrescriptions} findPharmacyMatch={findPharmacyMatch} onDispense={handleDispense} />
          )}
          {tab === 'Billing' && (
            <BillingTab
              patient={patient} invoices={patientInvoices} outstandingBalance={outstandingBalance}
              profile={profile} addInvoice={addInvoice} updateInvoice={updateInvoice} showToast={showToast}
            />
          )}
          {tab === 'Edit Info' && (
            <EditInfoTab patient={patient} updatePatient={updatePatient} showToast={showToast} />
          )}
        </div>

        {toast && (
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)',
            padding: '10px 18px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, maxWidth: '85%', textAlign: 'center',
          }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 100,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
}

const panelStyle = {
  position: 'relative', width: '100%', maxWidth: 640, maxHeight: '88vh',
  background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 16,
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
}

function detailRow(label, value){
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{value || '—'}</div>
    </div>
  )
}

const ADMISSION_STATUS_MAP = {
  pending: { heading: '🏥 ADMISSION RECOMMENDED', label: 'Awaiting Admission', color: 'var(--gold)' },
  approved: { heading: '🏥 ADMISSION APPROVED', label: 'Admission Approved', color: 'var(--teal)' },
  converted: { heading: '🏥 CURRENTLY ADMITTED', label: 'Currently Admitted', color: 'var(--teal)' },
}

function AdmissionStatusCard({ request }){
  if (!request) return null
  const meta = ADMISSION_STATUS_MAP[request.status] || { heading: '🏥 ADMISSION REQUEST', label: request.status, color: 'var(--muted)' }

  return (
    <div style={{
      marginBottom: 20, padding: 16, borderRadius: 10,
      background: 'var(--bg-elevated)', border: `1px solid ${meta.color}`,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: meta.color, marginBottom: 10 }}>{meta.heading}</div>
      <div style={{ fontSize: 13, marginBottom: 10 }}>
        {request.doctor_name ? `Dr. ${request.doctor_name}` : 'A doctor'} has recommended admission.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        {request.diagnosis && detailRow('Diagnosis', request.diagnosis)}
        {request.priority && detailRow('Priority', request.priority)}
        {request.requested_ward && detailRow('Requested Ward', request.requested_ward)}
        {request.requested_bed_type && detailRow('Requested Bed Type', request.requested_bed_type)}
      </div>
      {request.reason && (<div style={{ marginBottom: 10 }}>{detailRow('Reason', request.reason)}</div>)}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: meta.color }}>{meta.label}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Requested: {new Date(request.created_at).toLocaleString()}</span>
      </div>
    </div>
  )
}

function OverviewTab({ patient, latestConsultation, activePrescriptions, outstandingBalance, admissionRequest }){
  return (
    <div>
      <AdmissionStatusCard request={admissionRequest} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        {detailRow('Phone', patient.phone)}
        {detailRow('Blood Group / Genotype', [patient.blood_group, patient.genotype].filter(Boolean).join(' · '))}
        {detailRow('Address', patient.address)}
        {detailRow('Emergency Contact', patient.emergency_contact_name ? `${patient.emergency_contact_name}${patient.emergency_contact_phone ? ` — ${patient.emergency_contact_phone}` : ''}` : null)}
        {detailRow('Queue Status', patient.queue_status ? patient.queue_status.replace('_', ' ') : 'Not in queue')}
        {detailRow('Patient Status', patient.status === 'stable' ? 'Stable' : 'In Review')}
      </div>
      <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 20 }}>
        <div className="dash-stat-card">
          <div>
            <div className="dash-stat-label">Active Prescriptions</div>
            <div className="dash-stat-value">{activePrescriptions.length}</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div>
            <div className="dash-stat-label">Outstanding Balance</div>
            <div className="dash-stat-value" style={{ color: outstandingBalance > 0 ? 'var(--gold)' : undefined }}>₦{outstandingBalance.toLocaleString()}</div>
          </div>
        </div>
      </div>
      {latestConsultation ? (
        <div style={{ padding: 14, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Latest Consultation</div>
          {latestConsultation.diagnoses?.length > 0 && (
            <div style={{ fontSize: 13, marginBottom: 4 }}><strong>Diagnosis:</strong> {latestConsultation.diagnoses.map(d => d.code ? `${d.label} (${d.code})` : d.label).join(', ')}</div>
          )}
          {latestConsultation.treatment_plan && <div style={{ fontSize: 13 }}><strong>Treatment Plan:</strong> {latestConsultation.treatment_plan}</div>}
        </div>
      ) : (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>No completed consultations yet.</div>
      )}
    </div>
  )
}

function HistoryTab({ history }){
  if (history.length === 0) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>No past consultations recorded.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {history.map(v => (
        <div key={v.id} style={{ padding: 14, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 6 }}>{new Date(v.completed_at || v.created_at).toLocaleString()}</div>
          {v.chief_complaints && <div style={{ fontSize: 13, marginBottom: 4 }}><strong>Chief Complaint:</strong> {v.chief_complaints}</div>}
          {v.diagnoses?.length > 0 && <div style={{ fontSize: 13, marginBottom: 4 }}><strong>Diagnosis:</strong> {v.diagnoses.map(d => d.code ? `${d.label} (${d.code})` : d.label).join(', ')}</div>}
          {v.treatment_plan && <div style={{ fontSize: 13, marginBottom: 4 }}><strong>Treatment Plan:</strong> {v.treatment_plan}</div>}
          {v.follow_up_notes && <div style={{ fontSize: 13 }}><strong>Follow-up:</strong> {v.follow_up_notes}</div>}
        </div>
      ))}
    </div>
  )
}

// NEW COMPONENT: Items Given Tab
function ItemsGivenTab({ records }){
  if (records.length === 0) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>No items or drugs have been dispensed to this patient yet.</div>
  
  const totalCost = records.reduce((sum, r) => sum + Number(r.total_price || 0), 0)

  return (
    <div>
      <div style={{ marginBottom: 18, padding: 14, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Total Value of Items Given</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--teal)' }}>₦{totalCost.toLocaleString()}</div>
      </div>

      <ul className="dash-legend">
        {records.map(r => (
          <li key={r.id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <strong>{r.item_name}</strong>
              <span style={{ fontWeight: 700, color: 'var(--gold)' }}>₦{Number(r.total_price || 0).toLocaleString()}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <span>Qty: {r.quantity_used}</span>
              <span>{new Date(r.created_at).toLocaleString()}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PrescriptionsTab({ prescriptions }){
  if (prescriptions.length === 0) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>No prescriptions on record.</div>
  return (
    <ul className="dash-legend">
      {prescriptions.map(rx => (
        <li key={rx.id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '12px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <strong>{rx.drug_name}</strong>
            <span style={{
              fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
              background: rx.status === 'active' ? 'var(--teal-soft)' : rx.status === 'draft' ? 'rgba(201,169,97,0.14)' : 'rgba(255,255,255,0.06)',
              color: rx.status === 'active' ? 'var(--teal)' : rx.status === 'draft' ? 'var(--gold)' : 'var(--muted)',
            }}>
              {rx.status}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {rx.dosage}{rx.route ? ` · ${rx.route}` : ''}{rx.frequency ? ` · ${rx.frequency}` : ''}{rx.duration ? ` · ${rx.duration}` : ''}
          </div>
          {rx.instructions && <div style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic' }}>{rx.instructions}</div>}
        </li>
      ))}
    </ul>
  )
}

// ===================== DRUG ADMINISTRATION CHART (MAR) =====================

const DRUG_CHART_ROUTES = ['Oral', 'IV', 'IM', 'SC', 'Topical']
const DRUG_CHART_FREQUENCIES = ['Stat', 'OD', 'BD', 'TDS', 'QDS', 'PRN']
const DRUG_CHART_STATUSES = ['Pending', 'Given', 'Missed', 'Discontinued']

const DRUG_CHART_STATUS_STYLE = {
  Pending: { bg: 'rgba(201,169,97,0.14)', color: 'var(--gold)' },
  Given: { bg: 'var(--teal-soft)', color: 'var(--teal)' },
  Missed: { bg: 'rgba(240,79,95,0.12)', color: 'var(--danger)' },
  Discontinued: { bg: 'rgba(255,255,255,0.06)', color: 'var(--muted)' },
}

function emptyDrugChartForm(profile){
  const now = new Date()
  return {
    id: null,
    entry_date: now.toISOString().slice(0, 10),
    entry_time: now.toTimeString().slice(0, 5),
    drug_name: '',
    dosage: '',
    route: '',
    frequency: '',
    duration: '',
    prescribing_doctor: '',
    administering_nurse: profile?.role === 'nurse' ? (profile?.full_name || '') : '',
    status: 'Pending',
    remarks: '',
  }
}

function DrugChartTab({ patient, entries, profile, addEntry, updateEntry, deleteEntry, showToast }){
  const [form, setForm] = useState(() => emptyDrugChartForm(profile))
  const [saving, setSaving] = useState(false)

  function set(key, value){ setForm(f => ({ ...f, [key]: value })) }

  function handleEdit(entry){
    setForm({
      id: entry.id,
      entry_date: entry.entry_date || '',
      entry_time: entry.entry_time ? entry.entry_time.slice(0, 5) : '',
      drug_name: entry.drug_name || '',
      dosage: entry.dosage || '',
      route: entry.route || '',
      frequency: entry.frequency || '',
      duration: entry.duration || '',
      prescribing_doctor: entry.prescribing_doctor || '',
      administering_nurse: entry.administering_nurse || '',
      status: entry.status || 'Pending',
      remarks: entry.remarks || '',
    })
  }

  async function handleDelete(entry){
    if (!confirm(`Remove ${entry.drug_name} from this patient's drug chart?`)) return
    await deleteEntry(entry.id)
    showToast('Entry removed')
  }

  async function handleSubmit(e){
    e.preventDefault()
    if (!form.drug_name.trim()) { showToast('Drug name is required'); return }
    setSaving(true)
    try {
      const payload = {
        patient_id: patient.id,
        entry_date: form.entry_date || null,
        entry_time: form.entry_time || null,
        drug_name: form.drug_name,
        dosage: form.dosage || null,
        route: form.route || null,
        frequency: form.frequency || null,
        duration: form.duration || null,
        prescribing_doctor: form.prescribing_doctor || null,
        administering_nurse: form.administering_nurse || null,
        status: form.status,
        remarks: form.remarks || null,
        created_by: profile?.id || null,
      }
      if (form.id) { await updateEntry(form.id, payload); showToast('Entry updated') } 
      else { await addEntry(payload); showToast('Entry added to drug chart') }
      setForm(emptyDrugChartForm(profile))
    } catch (err) { showToast(err.message || 'Could not save entry') } 
    finally { setSaving(false) }
  }

  function handlePrint(){
    const rows = entries.map(e => `
      <tr>
        <td>${escapeHtml(e.entry_date || '')} ${escapeHtml((e.entry_time || '').slice(0,5))}</td>
        <td>${escapeHtml(e.drug_name)}</td>
        <td>${escapeHtml(e.dosage || '')}</td>
        <td>${escapeHtml(e.route || '')}</td>
        <td>${escapeHtml(e.frequency || '')}</td>
        <td>${escapeHtml(e.duration || '')}</td>
        <td>${escapeHtml(e.prescribing_doctor || '')}</td>
        <td>${escapeHtml(e.administering_nurse || '')}</td>
        <td>${escapeHtml(e.status)}</td>
        <td>${escapeHtml(e.remarks || '')}</td>
      </tr>`).join('')
    const html = `
      <html><head><title>Drug Chart — ${escapeHtml(patient.full_name)}</title>
      <style>
        body{font-family:sans-serif;padding:24px;color:#111}
        h1{font-size:17px;margin-bottom:4px}
        .meta{color:#555;font-size:12.5px;margin-bottom:18px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
        th{background:#f2f2f2}
      </style>
      </head><body>
      <h1>Drug Administration Chart</h1>
      <div class="meta">Patient: ${escapeHtml(patient.full_name)} &nbsp;·&nbsp; Printed: ${new Date().toLocaleString()}</div>
      <table>
        <thead><tr><th>Date/Time</th><th>Drug</th><th>Dosage</th><th>Route</th><th>Freq</th><th>Duration</th><th>Doctor</th><th>Nurse</th><th>Status</th><th>Remarks</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="10">No entries recorded</td></tr>'}</tbody>
      </table>
      </body></html>`
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  function escapeHtml(s){ return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }

  return (
    <div>
      <form onSubmit={handleSubmit} style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
        <div style={{ fontSize: 11, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 800, marginBottom: 10 }}>
          {form.id ? 'Edit Entry' : 'New Administration Entry'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field"><label>Date</label><input type="date" value={form.entry_date} onChange={e => set('entry_date', e.target.value)} /></div>
          <div className="field"><label>Time</label><input type="time" value={form.entry_time} onChange={e => set('entry_time', e.target.value)} /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label>Drug Name</label><input value={form.drug_name} onChange={e => set('drug_name', e.target.value)} placeholder="e.g. Paracetamol 1g" /></div>
          <div className="field"><label>Dosage / Strength</label><input value={form.dosage} onChange={e => set('dosage', e.target.value)} placeholder="e.g. 1g" /></div>
          <div className="field"><label>Route</label><select value={form.route} onChange={e => set('route', e.target.value)}><option value="">—</option>{DRUG_CHART_ROUTES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
          <div className="field"><label>Frequency</label><select value={form.frequency} onChange={e => set('frequency', e.target.value)}><option value="">—</option>{DRUG_CHART_FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
          <div className="field"><label>Duration</label><input value={form.duration} onChange={e => set('duration', e.target.value)} placeholder="e.g. 5 days" /></div>
          <div className="field"><label>Prescribing Doctor</label><input value={form.prescribing_doctor} onChange={e => set('prescribing_doctor', e.target.value)} placeholder="e.g. Dr. James" /></div>
          <div className="field"><label>Administering Nurse</label><input value={form.administering_nurse} onChange={e => set('administering_nurse', e.target.value)} placeholder="e.g. Nurse Grace" /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label>Status</label><select value={form.status} onChange={e => set('status', e.target.value)}>{DRUG_CHART_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label>Remarks</label><textarea rows={2} value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Optional" /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          {form.id && <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={() => setForm(emptyDrugChartForm(profile))}>Cancel Edit</button>}
          <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={saving}>{saving ? 'Saving…' : form.id ? 'Update Entry' : '+ Add Entry'}</button>
        </div>
      </form>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>History ({entries.length})</div>
        <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '5px 12px', fontSize: 11.5 }} onClick={handlePrint}>Print Chart</button>
      </div>

      {entries.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>No drug chart entries yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map(e => {
            const style = DRUG_CHART_STATUS_STYLE[e.status] || DRUG_CHART_STATUS_STYLE.Discontinued
            return (
              <div key={e.id} style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>{e.drug_name}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 9px', borderRadius: 20, background: style.bg, color: style.color }}>{e.status}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                      {e.entry_date} {e.entry_time ? e.entry_time.slice(0,5) : ''} · {e.dosage || '—'}{e.route ? ` · ${e.route}` : ''}{e.frequency ? ` · ${e.frequency}` : ''}{e.duration ? ` · ${e.duration}` : ''}
                    </div>
                    {(e.prescribing_doctor || e.administering_nurse) && (
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                        {e.prescribing_doctor ? `Dr. ${e.prescribing_doctor}` : ''}{e.prescribing_doctor && e.administering_nurse ? ' · ' : ''}{e.administering_nurse ? `Nurse: ${e.administering_nurse}` : ''}
                      </div>
                    )}
                    {e.remarks && <div style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic', marginTop: 4 }}>{e.remarks}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button type="button" onClick={() => handleEdit(e)} className="btn btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 11 }}>Edit</button>
                    <button type="button" onClick={() => handleDelete(e)} style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--danger)', borderRadius: 8, width: 28, height: 28, cursor: 'pointer' }}>✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
// ===================== END DRUG CHART =====================

function PharmacyTab({ activePrescriptions, findPharmacyMatch, onDispense }){
  if (activePrescriptions.length === 0) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>No medications awaiting dispensing.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {activePrescriptions.map(rx => {
        const match = findPharmacyMatch(rx.drug_name)
        return (
          <div key={rx.id} style={{ padding: 14, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{rx.drug_name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{rx.dosage}{rx.frequency ? ` · ${rx.frequency}` : ''}</div>
                <div style={{ fontSize: 11.5, marginTop: 4, color: match ? (Number(match.quantity) > 0 ? 'var(--teal)' : 'var(--danger)') : 'var(--muted)' }}>
                  {match ? `${match.quantity} ${match.unit || 'units'} in stock` : 'Not tracked in pharmacy inventory'}
                </div>
              </div>
              <button className="btn btn-primary" style={{ width: 'auto', padding: '6px 14px', fontSize: 12 }} onClick={() => onDispense(rx)}>Dispense</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BillingTab({ patient, invoices, outstandingBalance, profile, addInvoice, updateInvoice, showToast }){
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAddCharge(e){
    e.preventDefault()
    if (!amount) return
    setSaving(true)
    try {
      await addInvoice({
        patient_id: patient.id, // FIX: ensure manual charges link to patient_id
        patient_name: patient.full_name,
        description: description || 'Charge',
        amount: parseFloat(amount),
        status: 'unpaid',
        created_by: profile?.id || null,
      })
      setDescription(''); setAmount('')
      showToast('Charge added')
    } catch (err) {
      showToast(err.message || 'Could not add charge')
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(inv){
    const newStatus = inv.status === 'paid' ? 'unpaid' : 'paid'
    await updateInvoice(inv.id, { status: newStatus })
    showToast(`Marked ${newStatus}`)
  }

  return (
    <div>
      <div style={{ marginBottom: 18, padding: 14, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Outstanding Balance</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: outstandingBalance > 0 ? 'var(--gold)' : 'var(--teal)' }}>₦{outstandingBalance.toLocaleString()}</div>
      </div>

      <form onSubmit={handleAddCharge} style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" style={{ flex: 2 }} />
        <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" type="number" style={{ flex: 1 }} />
        <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '0 16px' }} disabled={saving}>Add</button>
      </form>

      {invoices.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>No charges on record.</div>
      ) : (
        <ul className="dash-legend">
          {invoices.map(inv => (
            <li key={inv.id}>
              <span className="dash-legend-name">
                <span className="dash-legend-dot" style={{ background: inv.status === 'paid' ? 'var(--teal)' : 'var(--gold)' }} />
                {inv.description || 'Charge'}
              </span>
              <span
                onClick={() => toggleStatus(inv)}
                className="dash-legend-val"
                style={{ cursor: 'pointer', color: inv.status === 'paid' ? 'var(--teal)' : 'var(--gold)', fontWeight: 700 }}
                title="Tap to toggle paid/unpaid"
              >
                ₦{Number(inv.amount).toLocaleString()} · {inv.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EditInfoTab({ patient, updatePatient, showToast }){
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({
      full_name: patient.full_name || '',
      age: patient.age ?? '',
      gender: patient.gender || '',
      phone: patient.phone || '',
      blood_group: patient.blood_group || '',
      genotype: patient.genotype || '',
      emergency_contact_name: patient.emergency_contact_name || '',
      emergency_contact_phone: patient.emergency_contact_phone || '',
      address: patient.address || '',
      status: patient.status || 'stable',
    })
  }, [patient.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!form) return null

  async function handleSave(e){
    e.preventDefault()
    setSaving(true)
    try {
      await updatePatient(patient.id, {
        full_name: form.full_name,
        age: form.age === '' ? null : parseInt(form.age, 10),
        gender: form.gender || null,
        phone: form.phone || null,
        blood_group: form.blood_group || null,
        genotype: form.genotype || null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
        address: form.address || null,
        status: form.status,
      })
      showToast('Patient details updated')
    } catch (err) {
      showToast(err.message || 'Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave}>
      <div className="field">
        <label>Full Name</label>
        <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="field"><label>Age</label><input type="number" value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} /></div>
        <div className="field"><label>Gender</label><select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}><option value="">—</option><option value="Male">Male</option><option value="Female">Female</option></select></div>
        <div className="field"><label>Phone</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
        <div className="field"><label>Patient Status</label><select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}><option value="stable">Stable</option><option value="review">In Review</option></select></div>
        <div className="field"><label>Blood Group</label><input value={form.blood_group} onChange={e => setForm(f => ({ ...f, blood_group: e.target.value }))} placeholder="e.g. O+" /></div>
        <div className="field"><label>Genotype</label><input value={form.genotype} onChange={e => setForm(f => ({ ...f, genotype: e.target.value }))} placeholder="e.g. AA" /></div>
        <div className="field"><label>Emergency Contact Name</label><input value={form.emergency_contact_name} onChange={e => setForm(f => ({ ...f, emergency_contact_name: e.target.value }))} /></div>
        <div className="field"><label>Emergency Contact Phone</label><input value={form.emergency_contact_phone} onChange={e => setForm(f => ({ ...f, emergency_contact_phone: e.target.value }))} /></div>
      </div>
      <div className="field"><label>Address</label><input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
      <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
    </form>
  )
}
