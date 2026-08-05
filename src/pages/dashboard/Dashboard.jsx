import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOfflineTable } from '../../lib/useOfflineTable';
import Appointments from './Appointments';
import Billing from './Billing';
import Staff from './Staff';
import Pharmacy from './Pharmacy';
import Laboratory from './Laboratory';
import IPD from './IPD';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'patients', label: 'Patients', icon: '👥' },
  { id: 'appointments', label: 'Appointments', icon: '📅' },
  { id: 'ipd', label: 'Wards & IPD', icon: '🛏️' },
  { id: 'pharmacy', label: 'Pharmacy', icon: '💊' },
  { id: 'laboratory', label: 'Laboratory', icon: '🔬' },
  { id: 'billing', label: 'Billing', icon: '💳' },
  { id: 'staff', label: 'Staff Management', icon: '👨‍⚕️' },
  { id: 'reports', label: 'Reports', icon: '📈' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function Dashboard() {
  const { profile, hospital, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Offline-aware hooks feeding the overview dashboard
  const { data: patients, loading: loadingPatients } = useOfflineTable('patients', hospital?.id);
  const { data: appointments } = useOfflineTable('appointments', hospital?.id);
  const { data: invoices } = useOfflineTable('invoices', hospital?.id);
  const { data: prescriptions } = useOfflineTable('prescriptions', hospital?.id);

  // Form states for adding patients locally/offline
  const [newPatient, setNewPatient] = useState({ full_name: '', age: '', gender: 'Male', phone: '', status: 'stable' });
  const { insertRow: addPatient, isOnline, pendingCount } = useOfflineTable('patients', hospital?.id);

  const handleRegisterPatient = async (e) => {
    e.preventDefault();
    if (!newPatient.full_name) return;
    await addPatient({
      ...newPatient,
      hospital_id: hospital?.id,
      age: parseInt(newPatient.age) || 0,
    });
    setNewPatient({ full_name: '', age: '', gender: 'Male', phone: '', status: 'stable' });
  };

  // Aggregated Offline-First Metrics
  const totalPatientsCount = patients ? patients.length : 0;
  
  const todayStr = new Date().toISOString().split('T')[0];
  const todayAppointmentsCount = appointments 
    ? appointments.filter(a => a.appointment_time && a.appointment_time.startsWith(todayStr)).length 
    : 0;

  const todayRevenue = invoices 
    ? invoices
        .filter(i => i.status === 'paid')
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    : 0;

  const pendingPrescriptionsCount = prescriptions 
    ? prescriptions.filter(p => p.status === 'pending').length 
    : 0;

  return (
    <div className="dash-shell">
      {/* Mobile Drawer Overlay */}
      <div 
        className={`dash-overlay ${sidebarOpen ? 'show' : ''}`} 
        onClick={() => setSidebarOpen(false)} 
      />

      {/* Sidebar Navigation */}
      <aside className={`dash-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="dash-brand">
          <div className="dash-brand-mark">
            {hospital?.name ? hospital.name.charAt(0).toUpperCase() : 'G'}
          </div>
          <div>
            <div className="dash-brand-name">{hospital?.name || 'G-MedHub'}</div>
            <div className="dash-brand-sub">{hospital?.subscription_tier || 'Tier 1'} Tenant</div>
          </div>
        </div>

        <nav style={{ marginTop: '16px' }}>
          {NAV_ITEMS.map((item) => (
            <div
              key={item.id}
              className={`dash-nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(item.id);
                setSidebarOpen(false);
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </nav>

        <div className="dash-foot">
          <div className="dash-foot-user">
            <div className="dash-foot-avatar" />
            <div>
              <div className="dash-foot-name">{profile?.full_name || 'Staff User'}</div>
              <div className="dash-foot-role">{profile?.role || 'User'}</div>
            </div>
          </div>
          <button 
            className="btn btn-ghost" 
            onClick={signOut} 
            style={{ marginTop: '12px', padding: '8px 12px', fontSize: '12px' }}
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top Header Bar */}
        <header className="dash-topbar">
          <div className="dash-burger" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </div>
          <div className="dash-hospital-name">{hospital?.name || 'Hospital Dashboard'}</div>
          
          <div className="dash-topbar-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ 
              fontSize: '11px', 
              padding: '4px 10px', 
              borderRadius: '20px', 
              background: isOnline ? 'var(--teal-soft)' : 'var(--danger-soft)',
              color: isOnline ? 'var(--teal)' : 'var(--danger)',
              border: `1px solid ${isOnline ? 'var(--line-strong)' : 'rgba(225,104,94,0.3)'}` 
            }}>
              ● {isOnline ? 'Online' : 'Offline'} {pendingCount > 0 && `(${pendingCount} syncing)`}
            </span>
          </div>
        </header>

        {/* Dynamic Tab Renderer */}
        <main className="dash-content">
          {activeTab === 'overview' && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h1 style={{ fontSize: '22px', fontFamily: 'var(--font-display)' }}>Hospital Command Center</h1>
                <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Real-time local and synchronized hospital telemetry</p>
              </div>

              {/* Stat Cards */}
              <div className="dash-stats">
                <div className="dash-stat-card">
                  <div className="dash-stat-label">Total Patients</div>
                  <div className="dash-stat-value">{loadingPatients ? '...' : totalPatientsCount}</div>
                  <div className="dash-stat-delta">Cached Locally</div>
                </div>

                <div className="dash-stat-card">
                  <div className="dash-stat-label">Today's Appointments</div>
                  <div className="dash-stat-value">{todayAppointmentsCount}</div>
                  <div className="dash-stat-delta">Scheduled</div>
                </div>

                <div className="dash-stat-card">
                  <div className="dash-stat-label">Total Revenue Collected</div>
                  <div className="dash-stat-value">₦ {todayRevenue.toLocaleString()}</div>
                  <div className="dash-stat-delta">Paid Invoices</div>
                </div>

                <div className="dash-stat-card">
                  <div className="dash-stat-label">Pending Prescriptions</div>
                  <div className="dash-stat-value">{pendingPrescriptionsCount}</div>
                  <span style={{ color: 'var(--gold)', fontSize: '11px', fontWeight: '700' }}>In Queue</span>
                </div>
              </div>

              {/* Quick Patient Registration & Directory */}
              <div className="dash-row dash-row-2">
                <div className="dash-panel">
                  <div className="dash-panel-head">
                    <div className="dash-panel-title">Quick Patient Registration</div>
                  </div>
                  <form onSubmit={handleRegisterPatient}>
                    <div className="field">
                      <label>Full Name</label>
                      <input 
                        type="text" 
                        required 
                        value={newPatient.full_name} 
                        onChange={(e) => setNewPatient({ ...newPatient, full_name: e.target.value })} 
                        placeholder="e.g. Samuel Adebayo"
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="field">
                        <label>Age</label>
                        <input 
                          type="number" 
                          value={newPatient.age} 
                          onChange={(e) => setNewPatient({ ...newPatient, age: e.target.value })} 
                          placeholder="35"
                        />
                      </div>
                      <div className="field">
                        <label>Gender</label>
                        <select 
                          value={newPatient.gender} 
                          onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value })}
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                      </div>
                    </div>
                    <div className="field">
                      <label>Phone Number</label>
                      <input 
                        type="text" 
                        value={newPatient.phone} 
                        onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} 
                        placeholder="+234..."
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }}>
                      Register Patient
                    </button>
                  </form>
                </div>

                <div className="dash-panel">
                  <div className="dash-panel-head">
                    <div className="dash-panel-title">Recent Registrations</div>
                  </div>
                  <ul className="dash-legend">
                    {patients && patients.slice(-5).reverse().map((p) => (
                      <li key={p.id || p.temp_id}>
                        <div className="dash-legend-name">
                          <span className="dash-legend-dot" style={{ background: 'var(--teal)' }} />
                          {p.full_name} ({p.gender}, {p.age})
                        </div>
                        <div className="dash-legend-val">{p.status || 'stable'}</div>
                      </li>
                    ))}
                    {(!patients || patients.length === 0) && (
                      <li style={{ color: 'var(--muted)', fontSize: '13px' }}>No patients registered yet.</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'patients' && (
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div className="dash-panel-title">Patient Directory</div>
              </div>
              <ul className="dash-legend">
                {patients && patients.map((p) => (
                  <li key={p.id || p.temp_id}>
                    <div className="dash-legend-name">
                      <span className="dash-legend-dot" style={{ background: 'var(--teal)' }} />
                      <strong>{p.full_name}</strong> &nbsp;— {p.phone || 'No Phone'}
                    </div>
                    <div className="dash-legend-val">{p.gender}, {p.age} yrs</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activeTab === 'appointments' && <Appointments />}
          {activeTab === 'ipd' && <IPD />}
          {activeTab === 'pharmacy' && <Pharmacy />}
          {activeTab === 'laboratory' && <Laboratory />}
          {activeTab === 'billing' && <Billing />}
          {activeTab === 'staff' && <Staff />}

          {activeTab === 'reports' && (
            <div className="dash-panel" style={{ textAlign: 'center', padding: '40px' }}>
              <h2>Analytics & Reports</h2>
              <p style={{ color: 'var(--muted)', marginTop: '8px' }}>Module pending configuration.</p>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="dash-panel" style={{ textAlign: 'center', padding: '40px' }}>
              <h2>Hospital Settings</h2>
              <p style={{ color: 'var(--muted)', marginTop: '8px' }}>Module pending configuration.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
