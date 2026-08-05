import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOfflineTable } from '../../lib/useOfflineTable';

// Import existing modules
import Reception from './Reception';
import Nursing from './Nursing';
import DoctorWorkbench from './DoctorWorkbench';
import Appointments from './Appointments';
import Billing from './Billing';
import Pharmacy from './Pharmacy';
import Laboratory from './Laboratory';
import HospitalSettings from './HospitalSettings'; // <--- Hospital Settings Import

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'reception', label: 'Reception', icon: '📝' },
  { id: 'nursing', label: 'Nurses Station', icon: '🩺' },
  { id: 'doctor', label: "Doctor Workbench", icon: '👨‍⚕️' },
  { id: 'appointments', label: 'Appointments', icon: '📅' },
  { id: 'pharmacy', label: 'Pharmacy', icon: '💊' },
  { id: 'laboratory', label: 'Laboratory', icon: '🔬' },
  { id: 'billing', label: 'Billing', icon: '💳' },
  { id: 'settings', label: 'Hospital Settings', icon: '⚙️' }, // <--- Sidebar Nav Item
];

export default function Dashboard() {
  const { profile, hospital, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  const { data: patients } = useOfflineTable('patients', hospital?.id);
  const { data: invoices } = useOfflineTable('invoices', hospital?.id);

  const todayRevenue = invoices 
    ? invoices.filter(i => i.status === 'paid').reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    : 0;

  return (
    <div className="dash-shell">
      <aside className="dash-sidebar">
        <div className="dash-brand">
          <div className="dash-brand-name">{hospital?.name || 'G-MedHub'}</div>
        </div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <div
              key={item.id}
              className={`dash-nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span>{item.icon}</span> <span>{item.label}</span>
            </div>
          ))}
        </nav>
        <button className="btn btn-ghost" onClick={signOut} style={{ marginTop: '20px' }}>Sign Out</button>
      </aside>

      <main className="dash-content">
        {activeTab === 'overview' && (
          <div>
            <h1>Hospital Overview</h1>
            <p>Patients Registered: {patients ? patients.length : 0}</p>
            <p>Revenue Collected: ₦{todayRevenue.toLocaleString()}</p>
          </div>
        )}

        {activeTab === 'reception' && <Reception />}
        {activeTab === 'nursing' && <Nursing />}
        {activeTab === 'doctor' && <DoctorWorkbench />}
        {activeTab === 'appointments' && <Appointments />}
        {activeTab === 'pharmacy' && <Pharmacy />}
        {activeTab === 'laboratory' && <Laboratory />}
        {activeTab === 'billing' && <Billing />}
        {activeTab === 'settings' && <HospitalSettings />} {/* <--- Rendered Component */}
      </main>
    </div>
  );
}
