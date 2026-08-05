import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOfflineTable } from '../../lib/useOfflineTable';

export default function Billing() {
  const { hospital } = useAuth();
  const { data: invoices, insertRow: addInvoice, updateRow: updateInvoice } = useOfflineTable('invoices', hospital?.id);
  const { data: patients } = useOfflineTable('patients', hospital?.id);

  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    if (!selectedPatientId || !description || !amount) return;

    const patient = patients?.find(p => p.id === selectedPatientId);

    await addInvoice({
      hospital_id: hospital?.id,
      patient_id: selectedPatientId,
      patient_name: patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown Patient',
      description,
      amount: Number(amount) || 0,
      status: 'unpaid'
    });

    setDescription('');
    setAmount('');
    setSelectedPatientId('');
  };

  const handleToggleStatus = async (invoiceId, currentStatus) => {
    const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
    await updateInvoice(invoiceId, { status: newStatus });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontFamily: 'var(--font-display)' }}>Billing & Invoicing</h1>
        <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Generate patient bills, collect payments, and manage invoices</p>
      </div>

      <div className="dash-row dash-row-2">
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">Create New Invoice</div>
          </div>
          <form onSubmit={handleCreateInvoice}>
            <div className="field">
              <label>Select Patient *</label>
              <select required value={selectedPatientId} onChange={e => setSelectedPatientId(e.target.value)}>
                <option value="">-- Select Patient --</option>
                {patients && patients.map(p => (
                  <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Service / Item Description *</label>
              <input type="text" placeholder="e.g. Consultation Fee, Lab Test" value={description} onChange={e => setDescription(e.target.value)} required />
            </div>
            <div className="field">
              <label>Amount (₦) *</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }}>+ Generate Invoice</button>
          </form>
        </div>

        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">Recent Invoices</div>
          </div>
          <ul className="dash-legend">
            {invoices && invoices.map(inv => (
              <li key={inv.id || inv.temp_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{inv.patient_name}</strong>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{inv.description} — ₦{Number(inv.amount).toLocaleString()}</div>
                </div>
                <button 
                  className={`btn ${inv.status === 'paid' ? 'btn-ghost' : 'btn-primary'}`} 
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                  onClick={() => handleToggleStatus(inv.id, inv.status)}
                >
                  {inv.status === 'paid' ? '✓ Paid' : 'Mark Paid'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
