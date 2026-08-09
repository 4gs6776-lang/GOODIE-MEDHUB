import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'

export default function DoctorWorkbench(){
  const { profile, hospital } = useAuth()

  const { records: patients, loading: loadingPatients, updateRecord: updatePatient } = useOfflineTable('patients', hospital?.id)
  const { records: vitals, loading: loadingVitals, updateRecord: updateVitals } = useOfflineTable('patient_vitals', hospital?.id)
  const { records: labOrders, loading: loadingLabOrders, addRecord: addLabOrder } = useOfflineTable('lab_orders', hospital?.id)
  const { records: prescriptions, loading: loadingPrescriptions, addRecord: addPrescription } = useOfflineTable('prescriptions', hospital?.id)

  const loading = loadingPatients || loadingVitals || loadingLabOrders || loadingPrescriptions

  const [activeVitalsId, setActiveVitalsId] = useState(null)
  const [toast, setToast] = useState(null)

  // EMR note fields for the active consultation
  const [chiefComplaints, setChiefComplaints] = useState('')
  const [observations, setObservations] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [treatmentPlan, setTreatmentPlan] = useState('')
  const [completing, setCompleting] = useState(false)

  // Lab order quick-add
  const [labTestName, setLabTestName] = useState('')
  const [labNotes, setLabNotes] = useState('')
  const [savingLabOrder, setSavingLabOrder] = useState(false)

  // Prescription quick-add
  const [drugName, setDrugName] = useState('')
  const [dosage, setDosage] = useState('')
  const [frequency, setFrequency] = useState('')
  const [savingPrescription, setSavingPrescription] = useState(false)

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // Queue = triaged patients with vitals logged, still waiting for a doctor.
  const queue = vitals
    .filter(v => v.status === 'waiting')
    .sort((a, b) => {
      const order = { Emergency: 0, Urgent: 1, Routine: 2 }
      const urgencyDiff = (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3)
      if (urgencyDiff !== 0) return urgencyDiff
      return new Date(a.recorded_at || a.created_at) - new Date(b.recorded_at || b.created_at)
    })

  const activeVitals = vitals.find(v => v.id === activeVitalsId) || null
  const activePatient = activeVitals
    ? patients.find(p => p.id === activeVitals.patient_id) || null
    : null

  const activePatientLabOrders = activeVitals
    ? labOrders.filter(o => o.patient_vitals_id === activeVitals.id)
    : []
  const activePatientPrescriptions = activeVitals
    ? prescriptions.filter(p => p.patient_vitals_id === activeVitals.id)
    : []

  function openConsultation(v){
    setActiveVitalsId(v.id)
    setChiefComplaints(v.chief_complaints || '')
    setObservations(v.observations || '')
    setDiagnosis(v.diagnosis || '')
    setTreatmentPlan(v.treatment_plan || '')
  }

  function clearWorkbench(){
    setActiveVitalsId(null)
    setChiefComplaints(''); setObservations(''); setDiagnosis(''); setTreatmentPlan('')
    setLabTestName(''); setLabNotes('')
    setDrugName(''); setDosage(''); setFrequency('')
  }

  async function handleAddLabOrder(e){
    e.preventDefault()
    if (!activeVitals || !labTestName) return
    if (!hospital || !profile) {
      showToast('Still loading your account — try again in a moment')
      return
    }
    setSavingLabOrder(true)
    try {
      await addLabOrder({
        patient_vitals_id: activeVitals.id,
        patient_name: activePatient?.full_name || activeVitals.patient_name || 'Unknown',
        test_name: labTestName,
        notes: labNotes || null,
        status: 'requested',
        requested_at: new Date().toISOString(),
        created_by: profile.id,
      })
      setLabTestName(''); setLabNotes('')
      showToast('Lab order sent')
    } catch (err) {
      showToast(err.message || 'Could not save lab order')
    } finally {
      setSavingLabOrder(false)
    }
  }

  async function handleAddPrescription(e){
    e.preventDefault()
    if (!activeVitals || !drugName || !dosage) return
    if (!hospital || !profile) {
      showToast('Still loading your account — try again in a moment')
      return
    }
    setSavingPrescription(true)
    try {
      await addPrescription({
        patient_vitals_id: activeVitals.id,
        patient_name: activePatient?.full_name || activeVitals.patient_name || 'Unknown',
        drug_name: drugName,
        dosage,
        frequency: frequency || null,
        status: 'active',
        prescribed_at: new Date().toISOString(),
        created_by: profile.id,
      })
      setDrugName(''); setDosage(''); setFrequency('')
      showToast('Prescription added')
    } catch (err) {
      showToast(err.message || 'Could not save prescription')
    } finally {
      setSavingPrescription(false)
    }
  }

  async function handleCompleteConsultation(){
    if (!activeVitals) return
    if (!confirm(`Complete consultation for ${activePatient?.full_name || activeVitals.patient_name}?`)) return
    setCompleting(true)
    try {
      await updateVitals(activeVitals.id, {
        status: 'completed',
        chief_complaints: chiefComplaints || null,
        observations: observations || null,
        diagnosis: diagnosis || null,
        treatment_plan: treatmentPlan || null,
        completed_at: new Date().toISOString(),
        completed_by: profile?.id || null,
      })

      // Sync back with Reception's board — send to lab if the doctor ordered
      // tests during this visit, otherwise the visit is finished.
      if (activePatient) {
        const hasLabOrders = activePatientLabOrders.length > 0
        await updatePatient(activePatient.id, {
          queue_status: hasLabOrders ? 'in_lab' : 'discharged',
          queue_updated_at: new Date().toISOString(),
        })
      }

      showToast('Consultation completed')
      clearWorkbench()
    } catch (err) {
      showToast(err.message || 'Could not complete consultation')
    } finally {
      setCompleting(false)
    }
  }

  function vitalRow(label, value, unit){
    return (
      <div>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{value ? `${value}${unit ? ' ' + unit : ''}` : '—'}</div>
      </div>
    )
  }

  return (
    <>
      <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(139,124,246,0.14)', color: 'var(--violet)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6.3 7-6.3s7 2.8 7 6.3"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Waiting for Doctor</div>
            <div className="dash-stat-value">{queue.length}</div>
            <div className="dash-stat-delta" style={{ color: 'var(--gold)' }}>triaged patients</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 6 9 17l-5-5"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Consultations Completed</div>
            <div className="dash-stat-value">{vitals.filter(v => v.status === 'completed').length}</div>
            <div className="dash-stat-delta">total</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(201,169,97,0.14)', color: 'var(--gold)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M12 13v5M9.5 15.5h5"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Active Consultation</div>
            <div className="dash-stat-value" style={{ fontSize: 17 }}>{activePatient?.full_name || activeVitals?.patient_name || 'None'}</div>
            <div className="dash-stat-delta">{activeVitals ? 'in progress' : 'select from queue'}</div>
          </div>
        </div>
      </div>

      <div className="dash-row dash-row-2">
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <div className="dash-panel-title">Consultation Queue</div>
              <div className="dash-panel-sub">Triaged patients with vitals logged</div>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
          ) : queue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No patients waiting.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {queue.map(v => {
                const p = patients.find(pt => pt.id === v.patient_id)
                const isActive = activeVitalsId === v.id
                return (
                  <div
                    key={v.id}
                    onClick={() => openConsultation(v)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                      padding: '10px 14px', borderRadius: 10,
                      background: isActive ? 'var(--teal-soft)' : 'var(--bg-elevated)',
                      border: isActive ? '1px solid var(--teal)' : '1px solid var(--line-soft)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: isActive ? 'var(--teal)' : undefined }}>{p?.full_name || v.patient_name || 'Unknown patient'}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>BP {v.blood_pressure || '—'} · Pulse {v.pulse_rate || '—'}{v.assigned_doctor ? ` · Dr. ${v.assigned_doctor}` : ''}</div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: v.urgency === 'Emergency' ? 'var(--danger)' : v.urgency === 'Urgent' ? 'var(--gold)' : 'var(--gold)',
                    }}>
                      {v.urgency || 'Waiting'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <div className="dash-panel-title">Recorded Vitals</div>
              <div className="dash-panel-sub">{activePatient?.full_name || activeVitals?.patient_name || 'No patient selected'}</div>
            </div>
          </div>

          {!activeVitals ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Select a patient from the queue to view vitals.</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                {vitalRow('Blood Pressure', activeVitals.blood_pressure)}
                {vitalRow('Pulse', activeVitals.pulse_rate, 'bpm')}
                {vitalRow('Temperature', activeVitals.temperature, '°C')}
                {vitalRow('SpO2', activeVitals.spo2, '%')}
                {vitalRow('Respiratory Rate', activeVitals.respiratory_rate, 'bpm')}
                {vitalRow('Weight', activeVitals.weight, 'kg')}
                {vitalRow('Height', activeVitals.height, 'cm')}
                {vitalRow('Urgency', activeVitals.urgency)}
              </div>
              {activeVitals.nurse_notes && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line-soft)', fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' }}>
                  Nurse note: "{activeVitals.nurse_notes}"
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {activeVitals && (
        <>
          <div className="dash-panel" style={{ marginTop: 20 }}>
            <div className="dash-panel-head">
              <div>
                <div className="dash-panel-title">Clinical Notes</div>
                <div className="dash-panel-sub">Consultation record for this visit</div>
              </div>
            </div>

            <div className="field">
              <label>Chief Complaints</label>
              <input value={chiefComplaints} onChange={e => setChiefComplaints(e.target.value)} placeholder="e.g. Fever and headache for 3 days" />
            </div>
            <div className="field">
              <label>Clinical Observations & History</label>
              <input value={observations} onChange={e => setObservations(e.target.value)} placeholder="e.g. Temp 38.6°C, mild pharyngeal erythema, no prior history" />
            </div>
            <div className="field">
              <label>Diagnosis (ICD-10 / description)</label>
              <input value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="e.g. J06.9 — Acute upper respiratory infection" />
            </div>
            <div className="field">
              <label>Treatment Plan</label>
              <input value={treatmentPlan} onChange={e => setTreatmentPlan(e.target.value)} placeholder="e.g. Antipyretics, rest, review in 3 days" />
            </div>
          </div>

          <div className="dash-row dash-row-2" style={{ marginTop: 20 }}>
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <div className="dash-panel-title">Lab Orders</div>
                  <div className="dash-panel-sub">Request tests for this patient</div>
                </div>
              </div>

              <form onSubmit={handleAddLabOrder}>
                <div className="field">
                  <label>Test Name</label>
                  <input value={labTestName} onChange={e => setLabTestName(e.target.value)} placeholder="e.g. Full Blood Count" />
                </div>
                <div className="field">
                  <label>Notes</label>
                  <input value={labNotes} onChange={e => setLabNotes(e.target.value)} placeholder="Optional" />
                </div>
                <button type="submit" className="btn btn-primary" disabled={savingLabOrder}>{savingLabOrder ? 'Sending…' : 'Send Lab Order'}</button>
              </form>

              {activePatientLabOrders.length > 0 && (
                <ul className="dash-legend" style={{ marginTop: 16 }}>
                  {activePatientLabOrders.map(o => (
                    <li key={o.id}>
                      <span className="dash-legend-name"><span className="dash-legend-dot" style={{ background: 'var(--gold)' }} />{o.test_name}</span>
                      <span className="dash-legend-val">{o.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <div className="dash-panel-title">Prescriptions</div>
                  <div className="dash-panel-sub">Write medication for this patient</div>
                </div>
              </div>

              <form onSubmit={handleAddPrescription}>
                <div className="field">
                  <label>Drug Name</label>
                  <input value={drugName} onChange={e => setDrugName(e.target.value)} placeholder="e.g. Amoxicillin" />
                </div>
                <div className="field">
                  <label>Dosage</label>
                  <input value={dosage} onChange={e => setDosage(e.target.value)} placeholder="e.g. 500mg" />
                </div>
                <div className="field">
                  <label>Frequency</label>
                  <input value={frequency} onChange={e => setFrequency(e.target.value)} placeholder="e.g. 3x daily for 5 days" />
                </div>
                <button type="submit" className="btn btn-primary" disabled={savingPrescription}>{savingPrescription ? 'Saving…' : 'Add Prescription'}</button>
              </form>

              {activePatientPrescriptions.length > 0 && (
                <ul className="dash-legend" style={{ marginTop: 16 }}>
                  {activePatientPrescriptions.map(p => (
                    <li key={p.id}>
                      <span className="dash-legend-name"><span className="dash-legend-dot" style={{ background: 'var(--teal)' }} />{p.drug_name} — {p.dosage}</span>
                      <span className="dash-legend-val">{p.frequency || '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="dash-panel" style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="dash-panel-title">Finish Up</div>
              <div className="dash-panel-sub">Marks this visit as completed and clears the workbench</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={clearWorkbench}>Cancel</button>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleCompleteConsultation} disabled={completing}>
                {completing ? 'Completing…' : 'Complete Consultation'}
              </button>
            </div>
          </div>
        </>
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
