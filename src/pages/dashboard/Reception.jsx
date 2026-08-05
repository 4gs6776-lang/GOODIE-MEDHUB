import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOfflineTable } from '../../lib/useOfflineTable';

export default function Reception() {
  const { hospital } = useAuth();
  const { data: patients, insertRow: addPatient } = useOfflineTable('patients', hospital?.id);

  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    age: '',
    gender: 'Male',
    address: '',
    blood_group: 'Unknown',
    genotype: 'Unknown',
    emergency_contact: ''
  });

  const [search, setSearch] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.full_name) return;

    // Generate unique Hospital ID (e.g., HOSP-4821)
    const hospitalNum = `HOSP-${Math.floor(1000 + Math.random() * 9000)}`;

    await addPatient({
      ...formData,
      hospital_id: hospital?.id,
      hospital_number: hospitalNum,
      age: parseInt(formData.age) || 0,
      status: 'registered'
    });

    setFormData({
      full_name: '',
      phone: '',
      age: '',
      gender: 'Male',
      address: '',
      blood_group: 'Unknown',
      genotype: 'Unknown',
      emergency_contact: ''
    });
  };

  const filteredPatients = patients ? patients.filter(p => 
    p.full_name?.toLowerCase().includes(search.toLowerCase()) || 
    p.hospital_number?.toLowerCase().includes(search.toLowerCase()) ||
    p.phone?.includes(search)
  ) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontFamily: 'var(--font-display)' }}>Reception & Registration</h1>
        <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Register new patients and issue hospital record numbers</p>
      </div>

      <div className="dash-row dash-row-2">
        {/* PATIENT REGISTRATION FORM */}
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">New Patient Registration</div>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Full Name *</label>
              <input 
                type="text" 
                required 
                value={formData.full_name} 
                onChange={e => setFormData({ ...formData, full_name: e.target.value })} 
                placeholder="e.g. Chukwuma Adebayo"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="field">
                <label>Age *</label>
                <input 
                  type="number" 
                  required 
                  value={formData.age} 
                  onChange={e => setFormData({ ...formData, age: e.target.value })} 
                  placeholder="28"
                />
              </div>
              <div className="field">
                <label>Gender *</label>
                <select value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value })}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="field">
                <label>Phone Number</label>
                <input 
                  type="text" 
                  value={formData.phone} 
                  onChange={e => setFormData({ ...formData, phone: e.target.value })} 
                  placeholder="+234..."
                />
              </div>
              <div className="field">
                <label>Emergency Contact</label>
                <input 
                  type="text" 
                  value={formData.emergency_contact} 
                  onChange={e => setFormData({ ...formData, emergency_contact: e.target.value })} 
                  placeholder="Next of kin phone"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="field">
                <label>Blood Group</label>
                <select value={formData.blood_group} onChange={e => setFormData({ ...formData, blood_group: e.target.value })}>
                  <option value="Unknown">Unknown</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                </select>
              </div>
              <div className="field">
                <label>Genotype</label>
                <select value={formData.genotype} onChange={e => setFormData({ ...formData, genotype: e.target.value })}>
                  <option value="Unknown">Unknown</option>
                  <option value="AA">AA</option>
                  <option value="AS">AS</option>
                  <option value="SS">SS</option>
                  <option value="AC">AC</option>
                </select>
              </div>
            </div>

            <div className="field">
              <label>Residential Address</label>
              <input 
                type="text" 
                value={formData.address} 
                onChange={e => setFormData({ ...formData, address: e.target.value })} 
                placeholder="Street address, City"
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }}>
              Complete Registration
            </button>
          </form>
        </div>

        {/* REGISTERED PATIENT DIRECTORY */}
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">Registered Patients Directory</div>
          </div>

          <div className="field" style={{ marginBottom: '16px' }}>
            <input 
              type="text" 
              placeholder="🔍 Search name, phone, or hospital ID..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
            />
          </div>

          <ul className="dash-legend">
            {filteredPatients.map((p) => (
              <li key={p.id || p.temp_id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <strong>{p.full_name}</strong>
                  <span style={{ fontSize: '11px', color: 'var(--teal)', fontWeight: '700' }}>
                    {p.hospital_number || 'HOSP-NEW'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  {p.gender}, {p.age} yrs | Phone: {p.phone || 'N/A'}
                </div>
                {(p.blood_group !== 'Unknown' || p.genotype !== 'Unknown') && (
                  <div style={{ fontSize: '11px', color: 'var(--ivory)' }}>
                    Blood: {p.blood_group} | Genotype: {p.genotype}
                  </div>
                )}
              </li>
            ))}
            {filteredPatients.length === 0 && (
              <li style={{ color: 'var(--muted)', fontSize: '13px' }}>No patients found matching query.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
