import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOfflineTable } from '../../lib/useOfflineTable';

export default function Nursing() {
  const { hospital } = useAuth();
  
  const { data: patients } = useOfflineTable('patients', hospital?.id);
  const { data: vitalsQueue, insertRow: addVitals, updateRow: updateVitals } = useOfflineTable('patient_vitals', hospital?.id);
  const { data: staff } = useOfflineTable('profiles', hospital?.id);

  const doctors = staff ? staff.filter(s => s.role === 'doctor' || s.role === 'admin') : [];

  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [assignedDoctor, setAssignedDoctor] = useState('');
  const [urgency, setUrgency] = useState('Routine');
  
  const [vitals, setVitals] = useState({
    temperature: '',
    blood_pressure: '',
    pulse_rate: '',
    respiratory_rate: '',
    weight: '',
    height: '',
    nurse_notes: ''
  });

  const handleQueueWithVitals = async (e) => {
    e.preventDefault();
    if (!selectedPatientId || !assignedDoctor) return;

    const patientObj = patients.find(p => p.id === selectedPatientId);

    await addVitals({
      hospital_id: hospital?.id,
      patient_id: patientObj?.id,
      patient_name: patientObj ? patientObj.full_name : 'Unknown Patient',
      assigned_doctor: assignedDoctor,
      urgency,
      status: 'waiting',
      ...vitals
    });

    setSelectedPatientId('');
    setAssignedDoctor('');
    setUrgency('Routine');
    setVitals({ temperature: '', blood_pressure: '', pulse_rate: '', respiratory_rate: '', weight: '', height: '', nurse_notes: '' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontFamily: 'var(--font-display)' }}>Nurses' Triage & Vitals Station</h1>
        <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Capture clinical measurements and assign patients to doctor queues</p>
      </div>

      <div className="dash-row dash-row-2">
        {/* VITALS ENTRY FORM */}
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">Triage Patient & Record Vitals</div>
          </div>
          
          <form onSubmit={handleQueueWithVitals}>
            <div className="field">
              <label>Select Registered Patient *</label>
              <select 
                value={selectedPatientId} 
                onChange={e => setSelectedPatientId(e.target.value)}
                required
              >
                <option value="">-- Choose Patient --</option>
                {patients && patients.map(p => (
                  <option key={p.id || p.temp_id} value={p.id}>
                    {p.full_name} ({p.hospital_number || 'No ID'})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="field">
                <label>Assign Doctor *</label>
                <select 
                  value={assignedDoctor} 
                  onChange={e => setAssignedDoctor(e.target.value)}
                  required
                >
                  <option value="">-- Select Doctor --</option>
                  {doctors.map(d => (
                    <option key={d.id} value={d.full_name}>{d.full_name}</option>
                  ))}
                  <option value="Duty Doctor">Duty Doctor</option>
                </select>
              </div>

              <div className="field">
                <label>Priority / Urgency</label>
                <select value={urgency} onChange={e => setUrgency(e.target.value)}>
                  <option value="Routine">Routine</option>
                  <option value="Urgent">Urgent</option>
                  <option value="Emergency">Emergency</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '12px', fontWeight: '700', color: 'var(--teal)' }}>
              CLINICAL VITALS
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="field">
                <label>Temperature (°C)</label>
                <input type="text" placeholder="36.8" value={vitals.temperature} onChange={e => setVitals({...vitals, temperature: e.target.value})} />
              </div>
              <div className="field">
                <label>Blood Pressure</label>
                <input type="text" placeholder="120/80" value={vitals.blood_pressure} onChange={e => setVitals({...vitals, blood_pressure: e.target.value})} />
              </div>
              <div className="field">
                <label>Pulse Rate (bpm)</label>
                <input type="text" placeholder="75" value={vitals.pulse_rate} onChange={e => setVitals({...vitals, pulse_rate: e.target.value})} />
              </div>
              <div className="field">
                <label>Resp. Rate (bpm)</label>
                <input type="text" placeholder="18" value={vitals.respiratory_rate} onChange={e => setVitals({...vitals, respiratory_rate: e.target.value})} />
              </div>
              <div className="field">
                <label>Weight (kg)</label>
                <input type="text" placeholder="68" value={vitals.weight} onChange={e => setVitals({...vitals, weight: e.target.value})} />
              </div>
              <div className="field">
                <label>Height (cm)</label>
                <input type="text" placeholder="175" value={vitals.height} onChange={e => setVitals({...vitals, height: e.target.value})} />
              </div>
            </div>

            <div className="field">
              <label>Nurse Observations / Complaints</label>
              <textarea 
                rows="2" 
                placeholder="Patient complains of severe migraine since morning..." 
                value={vitals.nurse_notes} 
                onChange={e => setVitals({...vitals, nurse_notes: e.target.value})}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }}>
              Save Vitals & Send to Doctor Queue
            </button>
          </form>
        </div>

        {/* ACTIVE WAITING ROOM QUEUE */}
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">Active Consultation Queue ({vitalsQueue ? vitalsQueue.filter(q => q.status === 'waiting').length : 0})</div>
          </div>

          <ul className="dash-legend">
            {vitalsQueue && vitalsQueue.filter(q => q.status !== 'completed').map((item) => (
              <li key={item.id || item.temp_id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px', padding: '12px 0' }}>
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

                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  Doctor: <strong>{item.assigned_doctor}</strong>
                </div>

                <div style={{ fontSize: '11px', color: 'var(--ivory)', background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: '6px', width: '100%' }}>
                  <div><strong>BP:</strong> {item.blood_pressure || 'N/A'} | <strong>Temp:</strong> {item.temperature ? `${item.temperature}°C` : 'N/A'}</div>
                  <div><strong>Pulse:</strong> {item.pulse_rate || 'N/A'} | <strong>Weight:</strong> {item.weight ? `${item.weight}kg` : 'N/A'}</div>
                  {item.nurse_notes && <div style={{ marginTop: '4px', fontStyle: 'italic', color: 'var(--gold)' }}>"{item.nurse_notes}"</div>}
                </div>

                <button 
                  className="btn btn-ghost" 
                  style={{ padding: '4px 8px', fontSize: '11px', alignSelf: 'flex-end' }}
                  onClick={() => updateVitals(item.id, { status: 'completed' })}
                >
                  Mark Consulted
                </button>
              </li>
            ))}
            {(!vitalsQueue || vitalsQueue.filter(q => q.status !== 'completed').length === 0) && (
              <li style={{ color: 'var(--muted)', fontSize: '13px' }}>No patients waiting in queue.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
