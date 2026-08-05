import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOfflineTable } from '../../lib/useOfflineTable';

export default function Reception() {
  const { hospital } = useAuth();
  const { data: patients, insertRow: addPatient, loading } = useOfflineTable('patients', hospital?.id);

  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    dob: '',
    gender: 'Male',
    phone: '',
    address: '',
    emergency_contact: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.first_name || !formData.last_name) return;

    await addPatient({
      ...formData,
      hospital_id: hospital?.id,
      created_at: new Date().toISOString()
    });

    setFormData({
      first_name: '',
      last_name: '',
      dob: '',
      gender: 'Male',
      phone: '',
      address: '',
      emergency_contact: ''
    });
  };

  const filteredPatients = patients?.filter(p => 
    `${p.first_name} ${p.last_name} ${p.phone}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontFamily: 'var(--font-display)' }}>Patient Reception & Intake</h1>
        <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Register new patients and manage directory records</p>
      </div>

      <div className="dash-row dash-row-2">
        {/* Registration Form */}
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">Register New Patient</div>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>First Name *</label>
              <input type="text" name="first_name" value={formData.first_name} onChange={handleChange} required />
            </div>
            <div className="field">
              <label>Last Name *</label>
              <input type="text" name="last_name" value={formData.last_name} onChange={handleChange} required />
            </div>
            <div className="field">
              <label>Date of Birth</label>
              <input type="date" name="dob" value={formData.dob} onChange={handleChange} />
            </div>
            <div className="field">
              <label>Gender</label>
              <select name="gender" value={formData.gender} onChange={handleChange}>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="field">
              <label>Phone Number</label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange} />
            </div>
            <div className="field">
              <label>Address</label>
              <input type="text" name="address" value={formData.address} onChange={handleChange} />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }}>
              + Save & Register Patient
            </button>
          </form>
        </div>

        {/* Directory List */}
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">Patient Directory ({filteredPatients ? filteredPatients.length : 0})</div>
          </div>
          <div className="field">
            <input 
              type="text" 
              placeholder="Search by name or phone..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
            />
          </div>
          <ul className="dash-legend" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {loading && <li>Loading directory...</li>}
            {filteredPatients && filteredPatients.map(p => (
              <li key={p.id || p.temp_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <strong>{p.first_name} {p.last_name}</strong>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{p.gender} | {p.phone || 'No Phone'}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
