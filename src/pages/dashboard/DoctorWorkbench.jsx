import React, { useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'

export default function DoctorWorkbench() {
  const { profile, hospital } = useAuth()

  const {
    records: patients,
    loading,
  } = useOfflineTable('patients', hospital?.id)

  const [activePatientId, setActivePatientId] = useState(null)

  const waitingPatients = useMemo(() => {
    return (patients || []).filter(
      patient => patient.queue_status === 'waiting'
    )
  }, [patients])

  const activePatient = waitingPatients.find(
    patient => patient.id === activePatientId
  )

  return (
    <div className="dash-row">

      {/* Queue */}
      <div className="dash-panel">

        <div className="dash-panel-head">
          <div className="dash-panel-title">
            Consultation Queue
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
            No patients currently waiting for consultation.
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
                  setActivePatientId(patient.id)
                }
                style={{ cursor: 'pointer' }}
              >

                <div
                  style={{
                    fontFamily: 'var(--font-display)',
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


      {/* Patient */}
      <div className="dash-panel">

        <div className="dash-panel-head">
          <div className="dash-panel-title">
            {activePatient
              ? `Patient: ${activePatient.full_name}`
              : 'Consultation File'}
          </div>
        </div>

        {!activePatient ? (
          <p style={{ color: 'var(--muted)' }}>
            Select a patient from the queue.
          </p>
        ) : (

          <div>

            <div className="field">
              <label>Full Name</label>
              <div>{activePatient.full_name}</div>
            </div>

            <div className="field">
              <label>Age</label>
              <div>{activePatient.age || '—'}</div>
            </div>

            <div className="field">
              <label>Gender</label>
              <div>{activePatient.gender || '—'}</div>
            </div>

            <div className="field">
              <label>Phone</label>
              <div>{activePatient.phone || '—'}</div>
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

        )}

      </div>

    </div>
  )
}
