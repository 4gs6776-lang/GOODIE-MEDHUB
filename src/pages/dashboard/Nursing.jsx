import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import PatientProfile from '../../components/PatientProfile'

const URGENCY_LEVELS = ['Routine', 'Urgent', 'Emergency']

export default function Nursing(){
  const { profile, hospital } = useAuth()
  const { records: patients, updateRecord: updatePatient } = useOfflineTable('patients', hospital?.id)
  const { records: vitalsQueue, loading, addRecord: addVitals } = useOfflineTable('patient_vitals', hospital?.id)
  const { records: staff } = useOfflineTable('profiles', hospital?.id)
  const { records: prescriptions, updateRecord: updatePrescription } = useOfflineTable('prescriptions', hospital?.id)

  const [toast, setToast] = useState(null)
  const [profilePatientId, setProfilePatientId] = useState(null)
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [assignedDoctor, setAssignedDoctor] = useState('')
  const [urgency, setUrgency] = useState('Routine')
  const [saving, setSaving] = useState(false)

  const [vitals, setVitals] = useState({
    temperature: '', blood_pressure: '', pulse_rate: '', respiratory_rate: '', spo2: '', weight: '', height: '', nurse_notes: '',
  })

  const doctors = staff ? staff.filter(s => s.role === 'doctor' || s.role === 'admin') : []

  // Checked-in patients are surfaced first, but any patient can be triaged.
  const readyForTriage = patients.filter(p => p.queue_status === 'waiting')
  const otherPatients = patients.filter(p => p.queue_status !== 'waiting')

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleQueueWithVitals(e){
    e.preventDefault()
    if (!selectedPatientId || !assignedDoctor) return
    if (!hospital || !profile) {
      showToast('Still loading your account — try again in a moment')
      return
    }

    const patientObj = patients.find(p => p.id === selectedPatientId)
    setSaving(true)
    try {
      await addVitals({
        patient_id: patientObj?.id,
        patient_name: patientObj ? patientObj.full_name : 'Unknown Patient',
        assigned_doctor: assignedDoctor,
        urgency,
        status: 'waiting',
        recorded_at: new Date().toISOString(),
        created_by: profile.id,
        ...vitals,
      })

      // Sync with Reception's board — patient moves from "Waiting" to "In Consultation".
      if (patientObj) {
        await updatePatient(patientObj.id, { queue_status: 'in_consultation', queue_updated_at: new Date().toISOString() })
      }

      setSelectedPatientId(''); setAssignedDoctor(''); setUrgency('Routine')
      setVitals({ temperature: '', blood_pressure: '', pulse_rate: '', respiratory_rate: '', spo2: '', weight: '', height: '', nurse_notes: '' })
      showToast('Vitals saved — sent to doctor queue')
    } catch (err) {
      showToast(err.message || 'Could not save vitals')
    } finally {
      setSaving(false)
    }
  }

  function urgencyColor(u){
    if (u === 'Emergency') return { bg: 'rgba(225,104,94,0.14)', color: 'var(--danger)' }
    if (u === 'Urgent') return { bg: 'rgba(201,169,97,0.14)', color: 'var(--gold)' }
    return { bg: 'var(--teal-soft)', color: 'var(--teal)' }
  }

  const activeQueue = vitalsQueue
    .filter(q => q.status !== 'completed')
    .sort((a, b) => {
      const order = { Emergency: 0, Urgent: 1, Routine: 2 }
      return (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3)
    })

  const activeOrders = prescriptions
    .filter(p => p.status === 'active')
    .sort((a, b) => new Date(b.prescribed_at || b.created_at) - new Date(a.prescribed_at || a.created_at))

  // Patient lookup — search any patient (not just those currently in the
  // queue), see their details, doctor's orders, and latest consultation.
  const [patientSearch, setPatientSearch] = useState('')
  const [selectedLookupPatientId, setSelectedLookupPatientId] = useState('')

  const lookupResults = patientSearch.trim()
    ? patients.filter(p => p.full_name.toLowerCase().includes(patientSearch.trim().toLowerCase())).slice(0, 20)
    : []
  const selectedLookupPatient = patients.find(p => p.id === selectedLookupPatientId) || null
  const lookupOrders = selectedLookupPatient
    ? activeOrders.filter(rx => rx.patient_name === selectedLookupPatient.full_name)
    : []
  const lookupLatestConsultation = selectedLookupPatient
    ? vitalsQueue
        .filter(v => v.patient_id === selectedLookupPatient.id && v.status === 'completed')
        .sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at))[0]
    : null

  function selectLookupPatient(id){
    setSelectedLookupPatientId(id)
    setPatientSearch('')
  }

  async function handleMarkAdministered(rx){
    await updatePrescription(rx.id, { status: 'dispensed' })
    showToast(`Marked ${rx.drug_name} as administered for ${rx.patient_name}`)
  }

  return (
    <>
      <div className="dash-panel" style={{ marginBottom: 16 }}>
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Nurses' Triage & Vitals Station</div>
            <div className="dash-panel-sub">Capture clinical measurements and send patients to the doctor queue</div>
          </div>
        </div>
      </div>

      <div className="dash-row dash-row-2">
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">Triage Patient & Record Vitals</div>
          </div>

          {readyForTriage.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
              No patients currently checked in at Reception waiting for triage.
            </div>
          )}

          <form onSubmit={handleQueueWithVitals}>
            <div className="field">
              <label>Select Patient</label>
              <select value={selectedPatientId} onChange={e => setSelectedPatientId(e.target.value)}>
                <option value="">-- Choose Patient --</option>
                {readyForTriage.length > 0 && (
                  <optgroup label="Checked-In (Waiting)">
                    {readyForTriage.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name}</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="All Patients">
                  {otherPatients.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field">
                <label>Assign Doctor</label>
                <select value={assignedDoctor} onChange={e => setAssignedDoctor(e.target.value)}>
                  <option value="">-- Select Doctor --</option>
                  {doctors.map(d => <option key={d.id} value={d.full_name}>{d.full_name}</option>)}
                  <option value="Duty Doctor">Duty Doctor</option>
                </select>
              </div>
              <div className="field">
                <label>Priority / Urgency</label>
                <select value={urgency} onChange={e => setUrgency(e.target.value)}>
                  {URGENCY_LEVELS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 12, marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>
              CLINICAL VITALS
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field">
                <label>Temperature (°C)</label>
                <input value={vitals.temperature} onChange={e => setVitals({ ...vitals, temperature: e.target.value })} placeholder="36.8" />
              </div>
              <div className="field">
                <label>Blood Pressure</label>
                <input value={vitals.blood_pressure} onChange={e => setVitals({ ...vitals, blood_pressure: e.target.value })} placeholder="120/80" />
              </div>
              <div className="field">
                <label>Pulse Rate (bpm)</label>
                <input value={vitals.pulse_rate} onChange={e => setVitals({ ...vitals, pulse_rate: e.target.value })} placeholder="75" />
              </div>
              <div className="field">
                <label>Resp. Rate (bpm)</label>
                <input value={vitals.respiratory_rate} onChange={e => setVitals({ ...vitals, respiratory_rate: e.target.value })} placeholder="18" />
              </div>
              <div className="field">
                <label>SpO2 (%)</label>
                <input value={vitals.spo2} onChange={e => setVitals({ ...vitals, spo2: e.target.value })} placeholder="98" />
              </div>
              <div className="field">
                <label>Weight (kg)</label>
                <input value={vitals.weight} onChange={e => setVitals({ ...vitals, weight: e.target.value })} placeholder="68" />
              </div>
              <div className="field">
                <label>Height (cm)</label>
                <input value={vitals.height} onChange={e => setVitals({ ...vitals, height: e.target.value })} placeholder="175" />
              </div>
            </div>

            <div className="field">
              <label>Nurse Observations / Complaints</label>
              <input value={vitals.nurse_notes} onChange={e => setVitals({ ...vitals, nurse_notes: e.target.value })} placeholder="e.g. Patient complains of severe migraine since morning" />
            </div>

            <button type="submit" className="btn btn-primary" disabled={saving} style={{ marginTop: 8 }}>
              {saving ? 'Saving…' : 'Save Vitals & Send to Doctor Queue'}
            </button>
          </form>
        </div>

        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">Active Consultation Queue ({activeQueue.filter(q => q.status === 'waiting').length})</div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
          ) : (
            <ul className="dash-legend">
              {activeQueue.map(item => {
                const uc = urgencyColor(item.urgency)
                return (
                  <li key={item.id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: '12px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <strong
                        onClick={() => item.patient_id && selectLookupPatient(item.patient_id)}
                        style={{ cursor: item.patient_id ? 'pointer' : 'default', color: selectedLookupPatientId === item.patient_id ? 'var(--teal)' : undefined }}
                        title="Click to view this patient's details and doctor's orders"
                      >
                        {item.patient_name}
                      </strong>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: uc.bg, color: uc.color, fontWeight: 700 }}>
                        {item.urgency}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Doctor: <strong>{item.assigned_doctor}</strong></div>
                    <div style={{ fontSize: 11, color: 'var(--ivory)', background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 6, width: '100%' }}>
                      <div><strong>BP:</strong> {item.blood_pressure || 'N/A'} · <strong>Temp:</strong> {item.temperature ? `${item.temperature}°C` : 'N/A'}</div>
                      <div><strong>Pulse:</strong> {item.pulse_rate || 'N/A'} · <strong>SpO2:</strong> {item.spo2 ? `${item.spo2}%` : 'N/A'} · <strong>Weight:</strong> {item.weight ? `${item.weight}kg` : 'N/A'}</div>
                      {item.nurse_notes && <div style={{ marginTop: 4, fontStyle: 'italic', color: 'var(--gold)' }}>"{item.nurse_notes}"</div>}
                    </div>
                  </li>
                )
              })}
              {activeQueue.length === 0 && (
                <li style={{ color: 'var(--muted)', fontSize: 13 }}>No patients waiting in queue.</li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="dash-panel" style={{ marginTop: 20 }}>
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Patient Lookup</div>
            <div className="dash-panel-sub">Search any patient to view their details and doctor's orders</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {selectedLookupPatient && (
              <button className="btn btn-ghost" style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }} onClick={() => setProfilePatientId(selectedLookupPatient.id)}>
                View Full Profile
              </button>
            )}
            {selectedLookupPatient && (
              <button className="btn btn-ghost" style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }} onClick={() => setSelectedLookupPatientId('')}>
                Clear
              </button>
            )}
          </div>
        </div>

        {!selectedLookupPatient && (
          <div className="field" style={{ marginBottom: 0 }}>
            <input
              value={patientSearch}
              onChange={e => setPatientSearch(e.target.value)}
              placeholder="Search patients by name…"
            />
          </div>
        )}

        {patientSearch.trim() && !selectedLookupPatient && (
          lookupResults.length === 0 ? (
            <div style={{ padding: '16px 0', color: 'var(--muted)', fontSize: 13 }}>No patients match "{patientSearch}".</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
              {lookupResults.map(p => (
                <div
                  key={p.id}
                  onClick={() => selectLookupPatient(p.id)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                    padding: '9px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)',
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{p.full_name}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{p.age ? `${p.age} yrs` : ''}{p.queue_status ? ` · ${p.queue_status.replace('_', ' ')}` : ''}</span>
                </div>
              ))}
            </div>
          )
        )}

        {selectedLookupPatient && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Name</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedLookupPatient.full_name}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Age / Gender</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedLookupPatient.age || '—'}{selectedLookupPatient.gender ? ` · ${selectedLookupPatient.gender}` : ''}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Phone</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedLookupPatient.phone || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Blood Group / Genotype</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedLookupPatient.blood_group || '—'}{selectedLookupPatient.genotype ? ` · ${selectedLookupPatient.genotype}` : ''}</div>
              </div>
              {selectedLookupPatient.emergency_contact_name && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Emergency Contact</div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedLookupPatient.emergency_contact_name}{selectedLookupPatient.emergency_contact_phone ? ` — ${selectedLookupPatient.emergency_contact_phone}` : ''}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Queue Status</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedLookupPatient.queue_status ? selectedLookupPatient.queue_status.replace('_', ' ') : 'Not in queue'}</div>
              </div>
            </div>

            {lookupLatestConsultation && (
              <div style={{ marginBottom: 18, padding: '10px 14px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Latest Consultation</div>
                {lookupLatestConsultation.diagnoses?.length > 0 && (
                  <div style={{ fontSize: 12.5, marginBottom: 4 }}>
                    <strong>Diagnosis:</strong> {lookupLatestConsultation.diagnoses.map(d => d.code ? `${d.label} (${d.code})` : d.label).join(', ')}
                  </div>
                )}
                {lookupLatestConsultation.treatment_plan && (
                  <div style={{ fontSize: 12.5 }}><strong>Treatment Plan:</strong> {lookupLatestConsultation.treatment_plan}</div>
                )}
              </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Doctor's Orders
            </div>
            {lookupOrders.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>No active doctor's orders for {selectedLookupPatient.full_name}.</div>
            ) : (
              <ul className="dash-legend">
                {lookupOrders.map(rx => (
                  <li key={rx.id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: '12px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <strong style={{ color: 'var(--ivory)' }}>{rx.drug_name}</strong>
                      <button
                        onClick={() => handleMarkAdministered(rx)}
                        className="btn btn-ghost"
                        style={{ padding: '4px 10px', fontSize: 11 }}
                      >
                        Mark Administered
                      </button>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {rx.dosage}{rx.route ? ` · ${rx.route}` : ''}{rx.frequency ? ` · ${rx.frequency}` : ''}{rx.duration ? ` · ${rx.duration}` : ''}
                    </div>
                    {rx.instructions && <div style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic' }}>{rx.instructions}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)',
          padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 60, maxWidth: '85vw', textAlign: 'center',
        }}>
          {toast}
        </div>
      )}

      {profilePatientId && (
        <PatientProfile patientId={profilePatientId} onClose={() => setProfilePatientId(null)} />
      )}
    </>
  )
}
