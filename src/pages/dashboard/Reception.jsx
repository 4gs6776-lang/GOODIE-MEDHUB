import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOfflineTable } from '../../lib/useOfflineTable';

export default function Reception() {
  const { hospital } = useAuth();
  
  // Offline-aware hooks for patients and queue
  const { data: patients } = useOfflineTable('patients', hospital?.id);
  const { data: queue, insertRow: addToQueue, updateRow: updateQueue } = useOfflineTable('patient_queue', hospital?.id);
  const { data: staff } = useOfflineTable('profiles', hospital?.id);

  // Form States
  const [selectedPatient, setSelectedPatient] = useState('');
  const [assignedDoctor, setAssignedDoctor] = useState('');
  const [urgency, setUrgency] = useState('Routine');
  
  // Vitals State
  const [vitals, setVitals] = useState({
    temperature: '',
    blood_pressure: '',
    pulse_rate: '',
    weight: ''
  });

  const doctors = staff ? staff.filter(s => s.role === 'doctor' || s.role === 'admin') : [];

  const handleQueuePatient = async (e) => {
    e.preventDefault();
    if (!selectedPatient || !assignedDoctor) return;

    const patientObj = patients.find(p => p.id === selectedPatient || p.full_name === selectedPatient);
    const patientName = patientObj ? patientObj.full_name : selectedPatient;

    await addToQueue({
      hospital_id: hospital?.id,
      patient_id: patientObj?.id || null,
      patient_name: patientName,
      assigned_doctor: assignedDoctor,
      urgency,
      status: 'waiting',
      ...vitals
    });

    // Reset Form
    setSelectedPatient('');
    setAssignedDoctor('');
    setUrgency('Routine');
    setVitals({ temperature: '', blood_pressure: '', pulse_rate: '', weight: '' });
  };

  const handleUpdateStatus = async (id, newStatus) => {
    await updateQueue(id, { status: newStatus });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontFamily: 'var(--font-display)' }}>Smart Reception & Triage</h1>
        <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Capture patient vitals and send them to doctor consultation queues</p>
      </div>

      <div className="dash-row dash-row-2">
        {/* TRIAGE & QUEUE FORM */}
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">Triage & Queue Patient</div>
          </div>
          
          <form onSubmit={handleQueuePatient}>
            <div className="field">
              <label>Select Registered Patient</label>
              <select 
                value={selectedPatient} 
                onChange={(e) => setSelectedPatient(e.target.value)}
                required
              >
                <option value="">-- Choose Patient --</option>
                {patients && patients.map(p => (
                  <option key={p.id || p.temp_id} value={p.id}>
                    {p.full_name} ({p.gender}, {p.age} yrs)
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="field">
                <label>Assign Doctor</label>
                <select 
                  value={assignedDoctor} 
                  onChange={(e) => setAssignedDoctor(e.target.value)}
                  required
                >
                  <option value="">-- Select Doctor --</option>
                  {doctors.length > 0 ? (
                    doctors.map(d => (
                      <option key={d.id} value={d.full_name}>{d.full_name}</option>
                    ))
                  ) : (
                    <option value="Duty Doctor">Duty Doctor</option>
                  )}
                </select>
              </div>

              <div className="field">
                <label>Priority / Urgency</label>
                <select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                  <option value="Routine">Routine</option>
                  <option value="Urgent">Urgent</option>
                  <option value="Emergency">Emergency</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '12px', fontWeight: '700', color: 'var(--teal)' }}>
              PATIENT VITALS (OPTIONAL AT RECEPTION)
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="field">
                <label>Temp (°C)</label>
                <input 
                  type="text" 
                  placeholder="36.5" 
                  value={vitals.temperature} 
                  onChange={(e) => setVitals({...vitals, temperature: e.target.value})}
                />
              </div>
              <div className="field">
                <label>Blood Pressure</label>
                <input 
                  type="text" 
                  placeholder="120/80" 
                  value={vitals.blood_pressure} 
                  onChange={(e) => setVitals({...vitals, blood_pressure: e.target.value})}
                />
              </div>
              <div className="field">
                <label>Pulse (bpm)</label>
                <input 
                  type="text" 
                  placeholder="72" 
                  value={vitals.pulse_rate} 
                  onChange={(e) => setVitals({...vitals, pulse_rate: e.target.value})}
                />
              </div>
              <div className="field">
                <label>Weight (kg)</label>
                <input 
                  type="text" 
                  placeholder="70" 
                  value={vitals.weight} 
                  onChange={(e) => setVitals({...vitals, weight: e.target.value})}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '10px' }}>
              Send to Consultation Queue
            </button>
          </form>
        </div>

        {/* LIVE QUEUE DISPLAY */}
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">Active Waiting Room ({queue ? queue.filter(q => q.status === 'waiting').length : 0})</div>
          </div>

          <ul className="dash-legend">
            {queue && queue.filter(q => q.status !== 'completed').map((item) => (
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

                {(item.temperature || item.blood_pressure) && (
                  <div style={{ fontSize: '11px', color: 'var(--ivory)', background: 'rgba(255,255,255,0.03)', padding: '6px', borderRadius: '6px', width: '100%' }}>
                    Vitals: {item.temperature && `Temp: ${item.temperature}°C `} 
                    {item.blood_pressure && `| BP: ${item.blood_pressure} `}
                    {item.weight && `| Wt: ${item.weight}kg`}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '4px' }}>
                  {item.status === 'waiting' && (
                    <button 
                      className="btn btn-ghost" 
                      style={{ padding: '4px 8px', fontSize: '11px' }}
                      onClick={() => handleUpdateStatus(item.id, 'in_consultation')}
                    >
                      Call into Room
                    </button>
                  )}
                  <button 
                    className="btn btn-primary" 
                    style={{ padding: '4px 8px', fontSize: '11px' }}
                    onClick={() => handleUpdateStatus(item.id, 'completed')}
                  >
                    Finish Consultation
                  </button>
                </div>
              </li>
            ))}
            {(!queue || queue.filter(q => q.status !== 'completed').length === 0) && (
              <li style={{ color: 'var(--muted)', fontSize: '13px' }}>No patients waiting in queue.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
