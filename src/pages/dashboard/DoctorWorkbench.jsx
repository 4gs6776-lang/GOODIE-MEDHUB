import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOfflineTable } from '../../lib/useOfflineTable';

export default function DoctorWorkbench() {
  const { hospital, profile } = useAuth();

  // Load patient queue (from Nursing), lab orders, and prescriptions
  const { data: queue, updateRow: updateQueue } = useOfflineTable('patient_vitals', hospital?.id);
  const { insertRow: addConsultation } = useOfflineTable('consultations', hospital?.id);
  const { insertRow: addPrescription } = useOfflineTable('prescriptions', hospital?.id);
  const { insertRow: addLabOrder } = useOfflineTable('lab_tests', hospital?.id);

  const [activePatient, setActivePatient] = useState(null);

  // Clinical Notes state
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');

  // Orders state
  const [medication, setMedication] = useState('');
  const [dosage, setDosage] = useState('');
  const [labTestName, setLabTestName] = useState('');

  const waitingPatients = queue ? queue.filter(q => q.status === 'waiting' || q.status === 'in_consultation') : [];

  const handleSelectPatient = (patient) => {
    setActivePatient(patient);
    updateQueue(patient.id, { status: 'in_consultation' });
  };

  const handleSaveConsultation = async (e) => {
    e.preventDefault();
    if (!activePatient) return;

    const doctorName = profile?.full_name || 'Dr. On Duty';

    // 1. Save Consultation Notes
    await addConsultation({
      hospital_id: hospital?.id,
      patient_id: activePatient.patient_id,
      patient_name: activePatient.patient_name,
      doctor_name: doctorName,
      chief_complaint: chiefComplaint,
      diagnosis,
      clinical_notes: clinicalNotes
    });

    // 2. Add Prescription if filled
    if (medication) {
      await addPrescription({
        hospital_id: hospital?.id,
        patient_id: activePatient.patient_id,
        patient_name: activePatient.patient_name,
        doctor_name: doctorName,
        medication_name: medication,
        dosage,
        status: 'pending'
      });
    }

    // 3. Add Lab Request if filled
    if (labTestName) {
      await addLabOrder({
        hospital_id: hospital?.id,
        patient_id: activePatient.patient_id,
        patient_name: activePatient.patient_name,
        test_name: labTestName,
        status: 'pending'
      });
    }

    // Mark patient queue complete
    await updateQueue(activePatient.id, { status: 'completed' });

    // Reset Form
    setActivePatient(null);
    setChiefComplaint('');
    setDiagnosis('');
    setClinicalNotes('');
    setMedication('');
    setDosage('');
    setLabTestName('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontFamily: 'var(--font-display)' }}>Doctor's Consultation Workbench</h1>
        <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Examine patients, review nurse vitals, write clinical notes, and send orders</p>
      </div>

      <div className="dash-row dash-row-2">
        {/* PATIENT WAITING QUEUE */}
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">Waiting Patients Queue ({waitingPatients.length})</div>
          </div>

          <ul className="dash-legend">
            {waitingPatients.map((item) => (
              <li 
                key={item.id || item.temp_id} 
                onClick={() => handleSelectPatient(item)}
                style={{ 
                  flexDirection: 'column', 
                  alignItems: 'flex-start', 
                  gap: '6px', 
                  cursor: 'pointer',
                  padding: '12px',
                  borderRadius: '8px',
                  background: activePatient?.id === item.id ? 'rgba(0, 180, 160, 0.15)' : 'transparent',
                  border: activePatient?.id === item.id ? '1px solid var(--teal)' : 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <strong>{item.patient_name}</strong>
                  <span style={{ 
                    fontSize: '10px', 
                    padding: '2px 8px', 
                    borderRadius: '10px', 
                    background: item.urgency === 'Emergency' ? 'var(--danger-soft)' : 'var(--teal-soft)',
                    color: item.urgency === 'Emergency' ? 'var(--danger)' : 'var(--teal)' 
                  }}>
                    {item.urgency}
                  </span>
                </div>

                <div style={{ fontSize: '11px', color: 'var(--ivory)', background: 'rgba(255,255,255,0.03)', padding: '6px', borderRadius: '4px', width: '100%' }}>
                  BP: <strong>{item.blood_pressure || 'N/A'}</strong> | Temp: <strong>{item.temperature ? `${item.temperature}°C` : 'N/A'}</strong> | Pulse: <strong>{item.pulse_rate || 'N/A'}</strong>
                </div>
              </li>
            ))}
            {waitingPatients.length === 0 && (
              <li style={{ color: 'var(--muted)', fontSize: '13px' }}>No patients currently waiting in queue.</li>
            )}
          </ul>
        </div>

        {/* CONSULTATION DESK */}
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">
              {activePatient ? `Consulting: ${activePatient.patient_name}` : 'Select a patient from the queue'}
            </div>
          </div>

          {activePatient ? (
            <form onSubmit={handleSaveConsultation}>
              <div className="field">
                <label>Chief Complaint / Symptoms *</label>
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. Fever, persistent cough for 3 days" 
                  value={chiefComplaint} 
                  onChange={e => setChiefComplaint(e.target.value)} 
                />
              </div>

              <div className="field">
                <label>Diagnosis *</label>
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. Acute Malaria / URTI" 
                  value={diagnosis} 
                  onChange={e => setDiagnosis(e.target.value)} 
                />
              </div>

              <div className="field">
                <label>Clinical Notes / Examination</label>
                <textarea 
                  rows="3" 
                  placeholder="Detailed clinical evaluation..." 
                  value={clinicalNotes} 
                  onChange={e => setClinicalNotes(e.target.value)} 
                />
              </div>

              <div style={{ marginTop: '14px', marginBottom: '8px', fontSize: '12px', fontWeight: '700', color: 'var(--teal)' }}>
                ELECTRONIC ORDERS (DIRECT TO DEPARTMENTS)
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field">
                  <label>Prescribe Medicine (Pharmacy)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Coartem 80/480mg" 
                    value={medication} 
                    onChange={e => setMedication(e.target.value)} 
                  />
                </div>
                <div className="field">
                  <label>Dosage</label>
                  <input 
                    type="text" 
                    placeholder="1 tabbd x 3 days" 
                    value={dosage} 
                    onChange={e => setDosage(e.target.value)} 
                  />
                </div>
              </div>

              <div className="field">
                <label>Order Lab Test (Laboratory)</label>
                <input 
                  type="text" 
                  placeholder="e.g. Full Blood Count, MP Test" 
                  value={labTestName} 
                  onChange={e => setLabTestName(e.target.value)} 
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: '12px', width: '100%' }}>
                Save Consultation & Route Orders
              </button>
            </form>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>
              👈 Click on any waiting patient in the left queue to open their clinical record file.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
