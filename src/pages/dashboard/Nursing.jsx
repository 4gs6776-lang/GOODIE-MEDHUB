import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'

const URGENCY_LEVELS = ['Routine', 'Urgent', 'Emergency']

export default function Nursing(){
  const { profile, hospital } = useAuth()
  const { records: patients, updateRecord: updatePatient } = useOfflineTable('patients', hospital?.id)
  const { records: vitalsQueue, loading, addRecord: addVitals } = useOfflineTable('patient_vitals', hospital?.id)
  const { records: staff } = useOfflineTable('profiles', hospital?.id)
  const { records: prescriptions, updateRecord: updatePrescription } = useOfflineTable('prescriptions', hospital?.id)

  const [toast, setToast] = useState(null)
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [assignedDoctor, setAssignedDoctor] = useState('')
  const [urgency, setUrgency] = useState('Routine')
  const [saving, setSaving] = useState(false)

  const [vitals, setVitals] = useState({
    temperature: '', blood_pressure: '', pulse_rate: '', respiratory_rate: '', spo2: '', weight: '', height: '', nurse_notes: '',
  })

  const doctors = staff ? staff.filter(s => s.role === 'doctor' || s.role === 'admin') : []

  // Only patients checked in at Reception and still waiting are ready for triage.
  const readyForTriage = patients.filter(p => p.queue_status === 'waiting')

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

  const [selectedPatientName, setSelectedPatientName] = useState('')
  const patientOrders = selectedPatientName
    ? activeOrders.filter(p => p.patient_name === selectedPatientName)
    : []

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
              <label>Select Checked-In Patient</label>
              <select value={selectedPatientId} onChange={e => setSelectedPatientId(e.target.value)}>
                <option value="">-- Choose Patient --</option>
                {readyForTriage.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
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
                        onClick={() => setSelectedPatientName(item.patient_name)}
                        style={{ cursor: 'pointer', color: selectedPatientName === item.patient_name ? 'var(--teal)' : undefined }}
                        title="Click to view this patient's doctor's orders"
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
            <div className="dash-panel-title">Doctor's Orders</div>
            <div className="dash-panel-sub">
              {selectedPatientName ? `Prescriptions for ${selectedPatientName}` : "Click a patient's name above to view their orders"}
            </div>
          </div>
          {selectedPatientName && (
            <button className="btn btn-ghost" style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }} onClick={() => setSelectedPatientName('')}>
              Clear
            </button>
          )}
        </div>

        {!selectedPatientName ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Select a patient to see their doctor's orders.</div>
        ) : patientOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No pending doctor's orders for {selectedPatientName}.</div>
        ) : (
          <ul className="dash-legend">
            {patientOrders.map(rx => (
              <li key={rx.id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <strong>{rx.patient_name}</strong>
                  <button
                    onClick={() => handleMarkAdministered(rx)}
                    className="btn btn-ghost"
                    style={{ padding: '4px 10px', fontSize: 11 }}
                  >
                    Mark Administered
                  </button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  <strong style={{ color: 'var(--ivory)' }}>{rx.drug_name}</strong> — {rx.dosage}{rx.frequency ? ` · ${rx.frequency}` : ''}
                </div>
              </li>
            ))}
          </ul>
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
    </>
  )
}
