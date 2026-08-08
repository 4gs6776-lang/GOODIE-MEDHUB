import React, { useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
export default function DoctorWorkbench() {
  const { profile, hospital } = useAuth()
  // Hospital data
  const { records: patients, updateRecord: updatePatient } =
    useOfflineTable('patients', hospital?.id)
  const { records: vitals, updateRecord: updateVitals } =
    useOfflineTable('patient_vitals', hospital?.id)
  const { records: labOrders, addRecord: addLabOrder } =
    useOfflineTable('lab_orders', hospital?.id)
  const { records: prescriptions, addRecord: addPrescription } =
    useOfflineTable('prescriptions', hospital?.id)
  const [activePatientId, setActivePatientId] = useState(null)
  // EMR fields
  const [chiefComplaints, setChiefComplaints] = useState('')
  const [clinicalObservations, setClinicalObservations] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [treatmentPlan, setTreatmentPlan] = useState('')
  // Lab
  const [labTestName, setLabTestName] = useState('')
  const [labPriority, setLabPriority] = useState('routine')
  // Prescription
  const [drugName, setDrugName] = useState('')
  const [dosage, setDosage] = useState('')
  const [frequency, setFrequency] = useState('')
  /*
   * RECEPTION -> DOCTOR CONNECTION
   *
   * Reception creates:
   *
   * patients.queue_status = 'waiting'
   *
   * Therefore the Doctor Workbench reads directly from patients.
   */
  const queue = useMemo(() => {
    if (!patients) return []
    return patients
      .filter((p) => p.queue_status === 'waiting')
      .map((patient) => {
        const patientVitals = (vitals || [])
          .filter((v) => v.patient_id === patient.id)
          .sort(
            (a, b) =>
              new Date(b.created_at || 0) -
              new Date(a.created_at || 0)
          )[0]
        return {
          ...patient,
          vitals: patientVitals || null,
        }
      })
  }, [patients, vitals])
  const activeEntry = useMemo(
    () => {
      if (!activePatientId) return null
      const patient = patients?.find(
        (p) => p.id === activePatientId
      )
      if (!patient) return null
      const patientVitals = (vitals || [])
        .filter((v) => v.patient_id === activePatientId)
        .sort(
          (a, b) =>
            new Date(b.created_at || 0) -
            new Date(a.created_at || 0)
        )[0]
      return {
        ...patient,
        vitals: patientVitals || null,
      }
    },
    [patients, vitals, activePatientId]
  )
  const activePatientLabOrders = useMemo(() => {
    if (!labOrders || !activePatientId) return []
    return labOrders.filter(
      (l) => l.patient_id === activePatientId
    )
  }, [labOrders, activePatientId])
  const activePatientPrescriptions = useMemo(() => {
    if (!prescriptions || !activePatientId) return []
    return prescriptions.filter(
      (p) => p.patient_id === activePatientId
    )
  }, [prescriptions, activePatientId])
  function resetWorkbench() {
    setActivePatientId(null)
    setChiefComplaints('')
    setClinicalObservations('')
    setDiagnosis('')
    setTreatmentPlan('')
    setLabTestName('')
    setLabPriority('routine')
    setDrugName('')
    setDosage('')
    setFrequency('')
  }
  async function handleSelectPatient(patientId) {
    setActivePatientId(patientId)
    setChiefComplaints('')
    setClinicalObservations('')
    setDiagnosis('')
    setTreatmentPlan('')
    // Mark patient as currently being seen by doctor
    await updatePatient(patientId, {
      queue_status: 'in_consultation',
      queue_updated_at: new Date().toISOString(),
    })
  }
  async function handleAddLabOrder(e) {
    e.preventDefault()
    if (!activeEntry || !labTestName.trim()) return
    try {
      await addLabOrder({
        patient_id: activeEntry.id,
        test_name: labTestName.trim(),
        priority: labPriority,
        status: 'requested',
        requested_by: profile?.id || null,
      })
      // Move patient to laboratory
      await updatePatient(activeEntry.id, {
        queue_status: 'in_lab',
        queue_updated_at: new Date().toISOString(),
      })
      setLabTestName('')
      setLabPriority('routine')
    } catch (err) {
      console.error('Could not create lab order:', err)
    }
  }
  async function handleAddPrescription(e) {
    e.preventDefault()
    if (
      !activeEntry ||
      !drugName.trim() ||
      !dosage.trim() ||
      !frequency.trim()
    ) {
      return
    }
    try {
      await addPrescription({
        patient_id: activeEntry.id,
        drug_name: drugName.trim(),
        dosage: dosage.trim(),
        frequency: frequency.trim(),
        prescribed_by: profile?.id || null,
      })
      setDrugName('')
      setDosage('')
      setFrequency('')
    } catch (err) {
      console.error('Could not create prescription:', err)
    }
  }
  async function handleCompleteConsultation() {
    if (!activeEntry) return
    try {
      /*
       * If a vitals record exists, save the doctor's
       * consultation information there.
       */
      if (activeEntry.vitals?.id) {
        await updateVitals(activeEntry.vitals.id, {
          chief_complaints: chiefComplaints,
          clinical_observations: clinicalObservations,
          diagnosis,
          treatment_plan: treatmentPlan,
          consulted_by: profile?.id || null,
          consulted_at: new Date().toISOString(),
          status: 'completed',
        })
      }
      /*
       * Reception and Doctor now share the same queue.
       *
       * After consultation, remove patient from
       * the waiting/in-consultation queue.
       */
      await updatePatient(activeEntry.id, {
        queue_status: 'discharged',
        queue_updated_at: new Date().toISOString(),
      })
      resetWorkbench()
    } catch (err) {
      console.error('Could not complete consultation:', err)
    }
  }
  return (
    <div className="dash-row">
      {/* =========================
          CONSULTATION QUEUE
      ========================== */}
      <div className="dash-panel">
        <div className="dash-panel-head">
          <div className="dash-panel-title">
            Consultation Queue
          </div>
          <div className="dash-legend">
            {queue.length} waiting
          </div>
        </div>
        {queue.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>
            No patients currently waiting for consultation.
          </p>
        ) : (
          <ul className="dash-list">
            {queue.map((entry) => (
              <li
                key={entry.id}
                className={`dash-list-item${
                  entry.id === activePatientId ? ' active' : ''
                }`}
                onClick={() => handleSelectPatient(entry.id)}
                style={{ cursor: 'pointer' }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  {entry.full_name}
                </div>
                <div
                  style={{
                    color: 'var(--muted)',
                    fontSize: '0.85em',
                  }}
                >
                  {entry.age ? `${entry.age} years` : ''}
                  {entry.gender
                    ? ` · ${entry.gender}`
                    : ''}
                  {entry.vitals?.bp
                    ? ` · BP ${entry.vitals.bp}`
                    : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* =========================
          CONSULTATION FILE
      ========================== */}
      <div className="dash-panel">
        <div className="dash-panel-head">
          <div className="dash-panel-title">
            {activeEntry
              ? `Consultation: ${activeEntry.full_name}`
              : 'Consultation File'}
          </div>
        </div>
        {!activeEntry ? (
          <p style={{ color: 'var(--muted)' }}>
            Select a patient from the queue to begin.
          </p>
        ) : (
          <>
            {/* PATIENT INFORMATION */}
            <div
              className="dash-legend"
              style={{
                marginBottom: '1em',
              }}
            >
              Patient Information
            </div>
            <div className="dash-row">
              <div className="field">
                <label>Full Name</label>
                <div>{activeEntry.full_name}</div>
              </div>
              <div className="field">
                <label>Age</label>
                <div>{activeEntry.age || '—'}</div>
              </div>
              <div className="field">
                <label>Gender</label>
                <div>{activeEntry.gender || '—'}</div>
              </div>
              <div className="field">
                <label>Phone</label>
                <div>{activeEntry.phone || '—'}</div>
              </div>
              <div className="field">
                <label>Blood Group</label>
                <div>{activeEntry.blood_group || '—'}</div>
              </div>
              <div className="field">
                <label>Genotype</label>
                <div>{activeEntry.genotype || '—'}</div>
              </div>
            </div>
            {/* VITALS */}
            <div
              className="dash-legend"
              style={{
                marginTop: '1.5em',
                marginBottom: '1em',
              }}
            >
              Recorded Vitals
            </div>
            <div className="dash-row">
              <div className="field">
                <label>Blood Pressure</label>
                <div>
                  {activeEntry.vitals?.bp || 'Not recorded'}
                </div>
              </div>
              <div className="field">
                <label>Pulse</label>
                <div>
                  {activeEntry.vitals?.pulse || 'Not recorded'}
                </div>
              </div>
              <div className="field">
                <label>Temperature</label>
                <div>
                  {activeEntry.vitals?.temperature || 'Not recorded'}
                </div>
              </div>
              <div className="field">
                <label>SpO₂</label>
                <div>
                  {activeEntry.vitals?.spo2 || 'Not recorded'}
                </div>
              </div>
              <div className="field">
                <label>Weight</label>
                <div>
                  {activeEntry.vitals?.weight || 'Not recorded'}
                </div>
              </div>
            </div>
            {/* CLINICAL NOTES */}
            <div
              className="dash-legend"
              style={{
                marginTop: '1.5em',
                marginBottom: '1em',
              }}
            >
              Clinical Notes
            </div>
            <div className="field">
              <label>Chief Complaints</label>
              <textarea
                value={chiefComplaints}
                onChange={(e) =>
                  setChiefComplaints(e.target.value)
                }
                rows={2}
              />
            </div>
            <div className="field">
              <label>
                Clinical Observations &amp; History
              </label>
              <textarea
                value={clinicalObservations}
                onChange={(e) =>
                  setClinicalObservations(e.target.value)
                }
                rows={3}
              />
            </div>
            <div className="field">
              <label>
                Diagnosis (ICD-10 / Description)
              </label>
              <input
                type="text"
                value={diagnosis}
                onChange={(e) =>
                  setDiagnosis(e.target.value)
                }
              />
            </div>
            <div className="field">
              <label>Treatment Plan</label>
              <textarea
                value={treatmentPlan}
                onChange={(e) =>
                  setTreatmentPlan(e.target.value)
                }
                rows={3}
              />
            </div>
            {/* LAB ORDERS */}
            <div
              className="dash-panel-head"
              style={{
                marginTop: '1.5em',
              }}
            >
              <div className="dash-panel-title">
                Lab Orders
              </div>
            </div>
            <form
              onSubmit={handleAddLabOrder}
              className="dash-row"
            >
              <div className="field">
                <label>Test Name</label>
                <input
                  type="text"
                  value={labTestName}
                  onChange={(e) =>
                    setLabTestName(e.target.value)
                  }
                  placeholder="e.g. Full Blood Count"
                />
              </div>
              <div className="field">
                <label>Priority</label>
                <select
                  value={labPriority}
                  onChange={(e) =>
                    setLabPriority(e.target.value)
                  }
                >
                  <option value="routine">
                    Routine
                  </option>
                  <option value="urgent">
                    Urgent
                  </option>
                  <option value="stat">
                    STAT
                  </option>
                </select>
              </div>
              <button
                type="submit"
                className="btn"
              >
                Add Lab Order
              </button>
            </form>
            {activePatientLabOrders.length > 0 && (
              <ul className="dash-list">
                {activePatientLabOrders.map((order) => (
                  <li
                    key={order.id}
                    className="dash-list-item"
                  >
                    <div>
                      {order.test_name}
                    </div>
                    <div
                      style={{
                        color: 'var(--muted)',
                        fontSize: '0.85em',
                      }}
                    >
                      {order.priority} · {order.status}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {/* PRESCRIPTIONS */}
            <div
              className="dash-panel-head"
              style={{
                marginTop: '1.5em',
              }}
            >
              <div className="dash-panel-title">
                Prescriptions
              </div>
            </div>
            <form
              onSubmit={handleAddPrescription}
              className="dash-row"
            >
              <div className="field">
                <label>Drug Name</label>
                <input
                  type="text"
                  value={drugName}
                  onChange={(e) =>
                    setDrugName(e.target.value)
                  }
                  placeholder="e.g. Amoxicillin"
                />
              </div>
              <div className="field">
                <label>Dosage</label>
                <input
                  type="text"
                  value={dosage}
                  onChange={(e) =>
                    setDosage(e.target.value)
                  }
                  placeholder="e.g. 500mg"
                />
              </div>
              <div className="field">
                <label>Frequency</label>
                <input
                  type="text"
                  value={frequency}
                  onChange={(e) =>
                    setFrequency(e.target.value)
                  }
                  placeholder="e.g. 3x daily"
                />
              </div>
              <button
                type="submit"
                className="btn"
              >
                Add Prescription
              </button>
            </form>
            {activePatientPrescriptions.length > 0 && (
              <ul className="dash-list">
                {activePatientPrescriptions.map((rx) => (
                  <li
                    key={rx.id}
                    className="dash-list-item"
                  >
                    <div>
                      {rx.drug_name} — {rx.dosage}
                    </div>
                    <div
                      style={{
                        color: 'var(--muted)',
                        fontSize: '0.85em',
                      }}
                    >
                      {rx.frequency}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {/* COMPLETE */}
            <div
              style={{
                marginTop: '2em',
              }}
            >
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCompleteConsultation}
              >
                Complete Consultation
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}