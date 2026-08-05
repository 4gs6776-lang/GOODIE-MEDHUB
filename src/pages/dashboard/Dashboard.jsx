import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOfflineTable } from '../../lib/useOfflineTable';
import Reception from './Reception';
import Nursing from './Nursing';
import DoctorWorkbench from './DoctorWorkbench';
import Appointments from './Appointments';
import Billing from './Billing';
import Staff from './Staff';
import Pharmacy from './Pharmacy';
import Laboratory from './Laboratory';
import IPD from './IPD';
import HospitalSettings from './HospitalSettings';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'reception', label: 'Reception (Registration)', icon: '📝' },
  { id: 'nursing', label: 'Nurses Station (Vitals)', icon: '🩺' },
  { id: 'doctor', label: "Doctor's Workbench", icon: '👨‍⚕️' },
  { id: 'appointments', label: 'Appointments', icon: '📅' },
  { id: 'ipd', label: 'Wards & IPD', icon: '🛏️' },
  { id: 'pharmacy', label: 'Pharmacy', icon: '💊' },
  { id: 'laboratory', label: 'Laboratory', icon: '🔬' },
  { id: 'billing', label: 'Billing & Receipts', icon: '💳' },
  { id: 'staff', label: 'Staff Management', icon: '👥' },
  { id: 'settings', label: 'Hospital Settings', icon: '⚙️' },
];

export default function Dashboard() {
  const { profile, hospital, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Offline-aware telemetry hooks
  const { data: patients, loading: loadingPatients } = useOfflineTable('patients', hospital?.id);
  const { data: appointments } = useOfflineTable('appointments', hospital?.id);
  const { data: invoices } = useOfflineTable('invoices', hospital?.id);
  const { data: vitalsQueue } = useOfflineTable('patient_vitals', hospital?.id);

  const totalPatientsCount = patients ? patients.length : 0;
  const waitingCount = vitalsQueue ? vitalsQueue.filter(q => q.status === 'waiting' || q.status === 'in_consultation').length : 0;

  const todayStr = new Date().toISOString().split('T')[0];
  const todayAppointmentsCount = appointments 
    ? appointments.filter(a => a.appointment_time && a.appointment_time.startsWith(todayStr)).length 
    : 0;

  const todayRevenue = invoices 
    ? invoices
        .filter(i => i.status === 'paid')
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    : 0;

  return (
    <div className="dash-shell">
      <div 
        className={`dash-overlay ${sidebarOpen ? 'show' : ''}`} 
        onClick={() => setSidebarOpen(false)} 
      />

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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header className="dash-topbar">
          <div className="dash-burger" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </div>
          <div className="dash-hospital-name">{hospital?.name || 'Hospital Dashboard'}</div>
        </header>

        <main className="dash-content">
          {activeTab === 'overview' && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h1 style={{ fontSize: '22px', fontFamily: 'var(--font-display)' }}>Hospital Command Center</h1>
                <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Real-time local and synchronized hospital telemetry</p>
              </div>

              <div className="dash-stats">
                <div className="dash-stat-card">
                  <div className="dash-stat-label">Total Registered Patients</div>
                  <div className="dash-stat-value">{loadingPatients ? '...' : totalPatientsCount}</div>
                </div>

                <div className="dash-stat-card">
                  <div className="dash-stat-label">Active Doctor Queue</div>
                  <div className="dash-stat-value">{waitingCount}</div>
                  <span style={{ color: 'var(--gold)', fontSize: '11px', fontWeight: '700' }}>Triaged & Waiting</span>
                </div>

                <div className="dash-stat-card">
                  <div className="dash-stat-label">Today's Appointments</div>
                  <div className="dash-stat-value">{todayAppointmentsCount}</div>
                </div>

                <div className="dash-stat-card">
                  <div className="dash-stat-label">Total Revenue Collected</div>
                  <div className="dash-stat-value">₦ {todayRevenue.toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reception' && <Reception />}
          {activeTab === 'nursing' && <Nursing />}
          {activeTab === 'doctor' && <DoctorWorkbench />}
          {activeTab === 'appointments' && <Appointments />}
          {activeTab === 'ipd' && <IPD />}
          {activeTab === 'pharmacy' && <Pharmacy />}
          {activeTab === 'laboratory' && <Laboratory />}
          {activeTab === 'billing' && <Billing />}
          {activeTab === 'staff' && <Staff />}
          {activeTab === 'settings' && <HospitalSettings />}
        </main>
      </div>
    </div>
  );
}
