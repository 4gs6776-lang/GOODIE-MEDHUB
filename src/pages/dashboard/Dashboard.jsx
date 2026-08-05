import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOfflineTable } from '../../lib/useOfflineTable';

// Department Sub-Components
import Reception from './Reception';
import Nursing from './Nursing';
import DoctorWorkbench from './DoctorWorkbench';
import Appointments from './Appointments';
import Billing from './Billing';
import Pharmacy from './Pharmacy';
import Laboratory from './Laboratory';
import HospitalSettings from './HospitalSettings';

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
      {/* Sidebar & Header Content */}
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
        {activeTab === 'settings' && <HospitalSettings />}
      </main>
    </div>
  );
}
