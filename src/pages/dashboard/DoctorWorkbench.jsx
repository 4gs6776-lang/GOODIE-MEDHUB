import React, { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOfflineTable } from '../../lib/useOfflineTable';

export default function DoctorWorkbench() {
  const { user, hospital } = useAuth();

  // Offline-first tables
  const { records: patients } = useOfflineTable('patients', hospital?.id);
  const { records: vitals, updateRecord: updateVitals } = useOfflineTable('patient_vitals', hospital?.id);
  const { records: labOrders, addRecord: addLabOrder } = useOfflineTable('lab_orders', hospital?.id);
  const { records: prescriptions, addRecord: addPrescription } = useOfflineTable('prescriptions', hospital?.id);

  const [activePatientId, setActivePatientId] = useState(null);

  // EMR note fields
  const [chiefComplaints, setChiefComplaints] = useState('');
  const [clinicalObservations, setClinicalObservations] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [treatmentPlan, setTreatmentPlan] = useState('');

  // Lab order quick-add
  const [labTestName, setLabTestName] = useState('');
  const [labPriority, setLabPriority] = useState('routine');

  // Prescription quick-add
  const [drugName, setDrugName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');

  // Patients waiting for consultation: have a vitals record logged, not yet completed
  const queue = useMemo(() => {
    if (!patients || !vitals) return [];
    return vitals
      .filter((v) => v.status !== 'completed')
      .map((v) => {
        const patient = patients.find((p) => p.id === v.patient_id);
        return patient ? { ...patient, vitals: v } : null;
      })
      .filter(Boolean);
  }, [patients, vitals]);

  const activeEntry = useMemo(
    () => queue.find((q) => q.id === activePatientId) || null,
    [queue, activePatientId]
  );

  const activePatientLabOrders = useMemo(() => {
    if (!labOrders || !activePatientId) return [];
    return labOrders.filter((l) => l.patient_id === activePatientId);
  }, [labOrders, activePatientId]);

  const activePatientPrescriptions = useMemo(() => {
    if (!prescriptions || !activePatientId) return [];
    return prescriptions.filter((p) => p.patient_id === activePatientId);
  }, [prescriptions, activePatientId]);

  function resetWorkbench() {
    setActivePatientId(null);
    setChiefComplaints('');
    setClinicalObservations('');
    setDiagnosis('');
    setTreatmentPlan('');
    setLabTestName('');
    setLabPriority('routine');
    setDrugName('');
    setDosage('');
    setFrequency('');
  }

  function handleSelectPatient(patientId) {
    setActivePatientId(patientId);
    setChiefComplaints('');
    setClinicalObservations('');
    setDiagnosis('');
    setTreatmentPlan('');
  }

  function handleAddLabOrder(e) {
    e.preventDefault();
    if (!activeEntry || !labTestName.trim()) return;

    addLabOrder({
      patient_id: activeEntry.id,
      test_name: labTestName.trim(),
      priority: labPriority,
      status: 'requested',
      requested_by: user?.id,
    });

    setLabTestName('');
    setLabPriority('routine');
  }

  function handleAddPrescription(e) {
    e.preventDefault();
    if (!activeEntry || !drugName.trim() || !dosage.trim() || !frequency.trim()) return;

    addPrescription({
      patient_id: activeEntry.id,
      drug_name: drugName.trim(),
      dosage: dosage.trim(),
      frequency: frequency.trim(),
      prescribed_by: user?.id,
    });

    setDrugName('');
    setDosage('');
    setFrequency('');
  }

  function handleCompleteConsultation() {
    if (!activeEntry) return;

    updateVitals(activeEntry.vitals.id, {
      status: 'completed',
      chief_complaints: chiefComplaints,
      clinical_observations: clinicalObservations,
      diagnosis,
      treatment_plan: treatmentPlan,
      consulted_by: user?.id,
      consulted_at: new Date().toISOString(),
    });

    resetWorkbench();
  }

  return (
    <div className="dash-row">
      {/* Active Queue Panel */}
      <div className="dash-panel">
        <div className="dash-panel-head">
          <div className="dash-panel-title">Consultation Queue</div>
          <div className="dash-legend">{queue.length} waiting</div>
        </div>

        {queue.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No patients currently waiting for consultation.</p>
        ) : (
          <ul className="dash-list">
            {queue.map((entry) => (
              <li
                key={entry.id}
                className={`dash-list-item${entry.id === activePatientId ? ' active' : ''}`}
                onClick={() => handleSelectPatient(entry.id)}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ fontFamily: 'var(--font-display)' }}>{entry.full_name}</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.85em' }}>
                  {entry.vitals?.bp ? `BP ${entry.vitals.bp}` : ''}
                  {entry.vitals?.pulse ? ` · Pulse ${entry.vitals.pulse}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Active Consultation Panel */}
      <div className="dash-panel">
        <div className="dash-panel-head">
          <div className="dash-panel-title">
            {activeEntry ? `Consultation: ${activeEntry.full_name}` : 'Consultation File'}
          </div>
        </div>

        {!activeEntry ? (
          <p style={{ color: 'var(--muted)' }}>Select a patient from the queue to begin.</p>
        ) : (
          <>
            {/* Vitals summary */}
            <div className="dash-legend" style={{ marginBottom: '1em' }}>Recorded Vitals</div>
            <div className="dash-row">
              <div className="field">
                <label>Blood Pressure</label>
                <div>{activeEntry.vitals?.bp || '—'}</div>
              </div>
              <div className="field">
                <label>Pulse</label>
                <div>{activeEntry.vitals?.pulse || '—'}</div>
              </div>
              <div className="field">
                <label>Temperature</label>
                <div>{activeEntry.vitals?.temperature || '—'}</div>
              </div>
              <div className="field">
                <label>SpO2</label>
                <div>{activeEntry.vitals?.spo2 || '—'}</div>
              </div>
              <div className="field">
                <label>Weight</label>
                <div>{activeEntry.vitals?.weight || '—'}</div>
              </div>
            </div>

            {/* Clinical EMR Notes */}
            <div className="dash-legend" style={{ marginTop: '1.5em', marginBottom: '1em' }}>
              Clinical Notes
            </div>
            <div className="field">
              <label>Chief Complaints</label>
              <textarea
                value={chiefComplaints}
                onChange={(e) => setChiefComplaints(e.target.value)}
                rows={2}
              />
            </div>
            <div className="field">
              <label>Clinical Observations &amp; History</label>
              <textarea
                value={clinicalObservations}
                onChange={(e) => setClinicalObservations(e.target.value)}
                rows={3}
              />
            </div>
            <div className="field">
              <label>Diagnosis (ICD-10 / Description)</label>
              <input
                type="text"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Treatment Plan</label>
              <textarea
                value={treatmentPlan}
                onChange={(e) => setTreatmentPlan(e.target.value)}
                rows={3}
              />
            </div>

            {/* Lab Orders */}
            <div className="dash-panel-head" style={{ marginTop: '1.5em' }}>
              <div className="dash-panel-title">Lab Orders</div>
            </div>
            <form onSubmit={handleAddLabOrder} className="dash-row">
              <div className="field">
                <label>Test Name</label>
                <input
                  type="text"
                  value={labTestName}
                  onChange={(e) => setLabTestName(e.target.value)}
                  placeholder="e.g. Full Blood Count"
                />
              </div>
              <div className="field">
                <label>Priority</label>
                <select value={labPriority} onChange={(e) => setLabPriority(e.target.value)}>
                  <option value="routine">Routine</option>
                  <option value="urgent">Urgent</option>
                  <option value="stat">STAT</option>
                </select>
              </div>
              <button type="submit" className="btn">Add Lab Order</button>
            </form>

            {activePatientLabOrders.length > 0 && (
              <ul className="dash-list">
                {activePatientLabOrders.map((order) => (
                  <li key={order.id} className="dash-list-item">
                    <div>{order.test_name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.85em' }}>
                      {order.priority} · {order.status}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Prescriptions */}
            <div className="dash-panel-head" style={{ marginTop: '1.5em' }}>
              <div className="dash-panel-title">Prescriptions</div>
            </div>
            <form onSubmit={handleAddPrescription} className="dash-row">
              <div className="field">
                <label>Drug Name</label>
                <input
                  type="text"
                  value={drugName}
                  onChange={(e) => setDrugName(e.target.value)}
                  placeholder="e.g. Amoxicillin"
                />
              </div>
              <div className="field">
                <label>Dosage</label>
                <input
                  type="text"
                  value={dosage}
                  onChange={(e) => setDosage(e.target.value)}
                  placeholder="e.g. 500mg"
                />
              </div>
              <div className="field">
                <label>Frequency</label>
                <input
                  type="text"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  placeholder="e.g. 3x daily"
                />
              </div>
              <button type="submit" className="btn">Add Prescription</button>
            </form>

            {activePatientPrescriptions.length > 0 && (
              <ul className="dash-list">
                {activePatientPrescriptions.map((rx) => (
                  <li key={rx.id} className="dash-list-item">
                    <div>{rx.drug_name} — {rx.dosage}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.85em' }}>{rx.frequency}</div>
                  </li>
                ))}
              </ul>
            )}

            {/* Completion */}
            <div style={{ marginTop: '2em' }}>
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
  );
}
