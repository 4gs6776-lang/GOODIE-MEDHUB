import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOfflineTable } from '../../lib/useOfflineTable';

// Imported Modular Sections
import Overview from './Overview';
import Reception from './Reception';

export default function Dashboard() {
  const { profile, hospital, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

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
    ? invoices.filter(i => i.status === 'paid').reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    : 0;

  return (
    <div className="dash-shell">
      <main className="dash-content">
        {activeTab === 'overview' && (
          <Overview 
            patientsCount={totalPatientsCount}
            waitingCount={waitingCount}
            todayAppointmentsCount={todayAppointmentsCount}
            todayRevenue={todayRevenue}
            loading={loadingPatients}
          />
        )}

        {activeTab === 'reception' && <Reception />}
      </main>
    </div>
  );
}
