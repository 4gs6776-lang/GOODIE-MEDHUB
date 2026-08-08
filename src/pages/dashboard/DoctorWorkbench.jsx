import React, { useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'

export default function DoctorWorkbench() {
  const { profile, hospital } = useAuth()

  const {
    records: patients,
    loading,
    updateRecord,
  } = useOfflineTable('patients', hospital?.id)

  const {
    records: vitals,
  } = useOfflineTable('patient_vitals', hospital?.id)

  const [activePatientId, setActivePatientId] = useState(null)

  /*
   * Patients waiting for a doctor
   */
  const waitingPatients = useMemo(() => {
    return (patients || []).filter(
      patient => patient.queue_status === 'waiting'
    )
  }, [patients])

  /*
   * Currently selected patient
   */
  const activePatient = useMemo(() => {
    return (patients || []).find(
      patient => patient.id === activePatientId
    ) || null
  }, [patients, activePatientId])

  /*
   * Get latest vitals for active patient
   */
  const activeVitals = useMemo(() => {
    if (!activePatientId) return null

    return (vitals || [])
      .filter(v => v.patient_id === activePatientId)
      .sort(
        (a, b) =>
          new Date(b.created_at || 0) -
          new Date(a.created_at || 0)
      )[0] || null
  }, [vitals, activePatientId])

  /*
   * Doctor selects patient
   */
  async function handleSelectPatient(patient) {
    setActivePatientId(patient.id)

    /*
     * Move patient from Waiting
     * to In Consultation.
     */
    if (patient.queue_status === 'waiting') {
      await updateRecord(patient.id, {
        queue_status: 'in_consultation',
        queue_updated_at: new Date().toISOString(),
        doctor_id: profile?.id || null,
      })
    }
  }

  return (
    <div className="dash-row">

      {/* =========================
          CONSULTATION QUEUE
      ========================== */}

      <div className="dash-panel">

        <div className="dash-panel-head">

          <div>
            <div className="dash-panel-title">
              Consultation Queue
            </div>

            <div
              style={{
                color: 'var(--muted)',
                fontSize: 12,
                marginTop: 4,
              }}
            >
              Patients waiting for consultation
            </div>
          </div>

          <div className="dash-legend">
            {waitingPatients.length} waiting
          </div>

        </div>


        {loading ? (

          <p style={{ color: 'var(--muted)' }}>
            Loading patients...
          </p>

        ) : waitingPatients.length === 0 ? (

          <p style={{ color: 'var(--muted)' }}>
            No patients currently waiting.
          </p>

        ) : (

          <ul className="dash-list">

            {waitingPatients.map(patient => (

              <li
                key={patient.id}
                className={`dash-list-item${
                  patient.id === activePatientId
                    ? ' active'
                    : ''
                }`}
                onClick={() =>
                  handleSelectPatient(patient)
                }
                style={{
                  cursor: 'pointer',
                }}
              >

                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                  }}
                >
                  {patient.full_name}
                </div>

                <div
                  style={{
                    color: 'var(--muted)',
                    fontSize: '0.85em',
                  }}
                >
                  {patient.age
                    ? `${patient.age} years`
                    : ''}

                  {patient.gender
                    ? ` · ${patient.gender}`
                    : ''}
                </div>

              </li>

            ))}

          </ul>

        )}

      </div>


      {/* =========================
          ACTIVE PATIENT
      ========================== */}

      <div className="dash-panel">

        <div className="dash-panel-head">

          <div className="dash-panel-title">
            {activePatient
              ? `Consultation: ${activePatient.full_name}`
              : 'Consultation File'}
          </div>

        </div>


        {!activePatient ? (

          <p style={{ color: 'var(--muted)' }}>
            Select a patient from the queue.
          </p>

        ) : (

          <>

            {/* PATIENT INFORMATION */}

            <div
              className="dash-legend"
              style={{
                marginBottom: 12,
              }}
            >
              Patient Information
            </div>

            <div className="dash-row">

              <div className="field">
                <label>Full Name</label>
                <div>
                  {activePatient.full_name || '—'}
                </div>
              </div>

              <div className="field">
                <label>Age</label>
                <div>
                  {activePatient.age || '—'}
                </div>
              </div>

              <div className="field">
                <label>Gender</label>
                <div>
                  {activePatient.gender || '—'}
                </div>
              </div>

              <div className="field">
                <label>Phone</label>
                <div>
                  {activePatient.phone || '—'}
                </div>
              </div>

              <div className="field">
                <label>Blood Group</label>
                <div>
                  {activePatient.blood_group || '—'}
                </div>
              </div>

              <div className="field">
                <label>Genotype</label>
                <div>
                  {activePatient.genotype || '—'}
                </div>
              </div>

            </div>


            {/* QUEUE STATUS */}

            <div
              style={{
                marginTop: 16,
                padding: 12,
                border: '1px solid var(--line)',
                borderRadius: 10,
              }}
            >

              <div
                style={{
                  color: 'var(--muted)',
                  fontSize: 11,
                  marginBottom: 4,
                }}
              >
                Current Status
              </div>

              <div
                style={{
                  fontWeight: 700,
                  color: 'var(--blue)',
                }}
              >
                In Consultation
              </div>

            </div>


            {/* VITALS */}

            <div
              className="dash-legend"
              style={{
                marginTop: 24,
                marginBottom: 12,
              }}
            >
              Patient Vitals
            </div>

            {!activeVitals ? (

              <div
                style={{
                  color: 'var(--muted)',
                  fontSize: 13,
                  padding: '10px 0',
                }}
              >
                No vitals have been recorded for this
                patient yet.
              </div>

            ) : (

              <div className="dash-row">

                <div className="field">
                  <label>Blood Pressure</label>
                  <div>
                    {activeVitals.bp || '—'}
                  </div>
                </div>

                <div className="field">
                  <label>Pulse</label>
                  <div>
                    {activeVitals.pulse || '—'}
                  </div>
                </div>

                <div className="field">
                  <label>Temperature</label>
                  <div>
                    {activeVitals.temperature || '—'}
                  </div>
                </div>

                <div className="field">
                  <label>SpO₂</label>
                  <div>
                    {activeVitals.spo2 || '—'}
                  </div>
                </div>

                <div className="field">
                  <label>Weight</label>
                  <div>
                    {activeVitals.weight || '—'}
                  </div>
                </div>

              </div>

            )}

          </>

        )}

      </div>

    </div>
  )
}