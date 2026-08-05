import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOfflineTable } from '../../lib/useOfflineTable';

export default function Laboratory() {
  const { hospital, profile } = useAuth();

  const { data: labOrders, insertRow: createLabOrder, updateRow: updateLabOrder } = useOfflineTable('lab_orders', hospital?.id);
  const { data: patients } = useOfflineTable('patients', hospital?.id);
  const { insertRow: addInvoice } = useOfflineTable('invoices', hospital?.id);

  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [newOrder, setNewOrder] = useState({
    test_type: 'Full Blood Count (FBC)',
    sample_type: 'Blood',
    test_cost: '5000'
  });

  const [resultInput, setResultInput] = useState({});

  const pendingOrders = labOrders ? labOrders.filter(o => o.status !== 'completed') : [];
  const completedOrders = labOrders ? labOrders.filter(o => o.status === 'completed') : [];

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!selectedPatientId) return;

    const selectedPatient = patients?.find(p => p.id === selectedPatientId);

    await createLabOrder({
      hospital_id: hospital?.id,
      patient_id: selectedPatientId,
      patient_name: selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name}` : 'Unknown Patient',
      test_type: newOrder.test_type,
      sample_type: newOrder.sample_type,
      test_cost: Number(newOrder.test_cost) || 0,
      doctor_name: profile?.full_name || 'Lab Direct Order',
      status: 'pending'
    });

    // Auto-generate invoice item for checkout
    await addInvoice({
      hospital_id: hospital?.id,
      patient_id: selectedPatientId,
      patient_name: selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name}` : 'Unknown Patient',
      description: `Lab Test: ${newOrder.test_type}`,
      amount: Number(newOrder.test_cost) || 0,
      status: 'unpaid'
    });

    setSelectedPatientId('');
  };

  const handleUpdateStatus = async (orderId, newStatus) => {
    await updateLabOrder(orderId, { status: newStatus });
  };

  const handleSaveResult = async (order) => {
    const summary = resultInput[order.id]?.summary;
    const notes = resultInput[order.id]?.notes;

    if (!summary) return alert('Please enter result values before marking completed.');

    await updateLabOrder(order.id, {
      results_summary: summary,
      lab_notes: notes || '',
      status: 'completed',
      completed_at: new Date().toISOString()
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontFamily: 'var(--font-display)' }}>Laboratory & Diagnostic Workbench</h1>
        <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Collect samples, run tests, record diagnostic findings, and auto-bill patients</p>
      </div>

      <div className="dash-row dash-row-2">
        {/* NEW LAB ORDER FORM */}
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">Request Direct Lab Test</div>
          </div>

          <form onSubmit={handleCreateOrder}>
            <div className="field">
              <label>Select Patient *</label>
              <select required value={selectedPatientId} onChange={e => setSelectedPatientId(e.target.value)}>
                <option value="">-- Choose Patient --</option>
                {patients && patients.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name} ({p.hospital_number || 'No ID'})
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Test Panel / Investigation *</label>
              <select value={newOrder.test_type} onChange={e => setNewOrder({ ...newOrder, test_type: e.target.value })}>
                <option value="Full Blood Count (FBC)">Full Blood Count (FBC)</option>
                <option value="Malaria Parasite (MP / RDT)">Malaria Parasite (MP / RDT)</option>
                <option value="Urinalysis">Urinalysis</option>
                <option value="Widal Test (Typhoid)">Widal Test (Typhoid)</option>
                <option value="Fasting Blood Sugar (FBS)">Fasting Blood Sugar (FBS)</option>
                <option value="Liver Function Test (LFT)">Liver Function Test (LFT)</option>
                <option value="Kidney Function Test (E/U/Cr)">Kidney Function Test (E/U/Cr)</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="field">
                <label>Sample Type</label>
                <select value={newOrder.sample_type} onChange={e => setNewOrder({ ...newOrder, sample_type: e.target.value })}>
                  <option value="Blood">Blood</option>
                  <option value="Urine">Urine</option>
                  <option value="Stool">Stool</option>
                  <option value="Swab">Swab</option>
                  <option value="Sputum">Sputum</option>
                </select>
              </div>

              <div className="field">
                <label>Test Price (₦)</label>
                <input 
                  type="number" 
                  value={newOrder.test_cost} 
                  onChange={e => setNewOrder({ ...newOrder, test_cost: e.target.value })} 
                />
              </div>
            </div>

            <button type="submit" className="btn btn-ghost" style={{ width: '100%', marginTop: '8px' }}>
              + Order Test & Bill Patient
            </button>
          </form>
        </div>

        {/* PENDING LAB QUEUE */}
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">Pending Investigations Queue ({pendingOrders.length})</div>
          </div>

          <ul className="dash-legend">
            {pendingOrders.map(order => (
              <li key={order.id || order.temp_id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '10px', padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <strong>{order.patient_name}</strong>
                  <span style={{ 
                    fontSize: '11px', 
                    fontWeight: '700', 
                    color: order.status === 'sample_collected' ? 'var(--teal)' : 'var(--gold)' 
                  }}>
                    {order.status === 'sample_collected' ? 'SAMPLE COLLECTED' : 'AWAITING SAMPLE'}
                  </span>
                </div>

                <div style={{ fontSize: '13px', color: 'var(--teal)', fontWeight: 'bold' }}>
                  🧪 {order.test_type} — <span style={{ color: 'var(--ivory)', fontWeight: 'normal' }}>Sample: {order.sample_type}</span>
                </div>

                {order.status === 'pending' && (
                  <button 
                    className="btn btn-ghost" 
                    style={{ padding: '6px 12px', fontSize: '12px', width: '100%' }}
                    onClick={() => handleUpdateStatus(order.id, 'sample_collected')}
                  >
                    ✓ Confirm Sample Collected
                  </button>
                )}

                {order.status === 'sample_collected' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '4px' }}>
                    <input 
                      type="text" 
                      placeholder="Result Summary (e.g. MP Positive (+2), Hb 12.5 g/dL)"
                      style={{ padding: '6px 10px', fontSize: '12px' }}
                      onChange={e => setResultInput({
                        ...resultInput,
                        [order.id]: { ...resultInput[order.id], summary: e.target.value }
                      })}
                    />
                    <input 
                      type="text" 
                      placeholder="Lab Notes / Observations (Optional)"
                      style={{ padding: '6px 10px', fontSize: '12px' }}
                      onChange={e => setResultInput({
                        ...resultInput,
                        [order.id]: { ...resultInput[order.id], notes: e.target.value }
                      })}
                    />
                    <button 
                      className="btn btn-primary" 
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                      onClick={() => handleSaveResult(order)}
                    >
                      Publish Lab Result
                    </button>
                  </div>
                )}
              </li>
            ))}
            {pendingOrders.length === 0 && (
              <li style={{ color: 'var(--muted)', fontSize: '13px' }}>No lab orders waiting.</li>
            )}
          </ul>
        </div>
      </div>

      {/* COMPLETED RESULTS LOG */}
      <div className="dash-panel">
        <div className="dash-panel-head">
          <div className="dash-panel-title">Completed Test Results Log</div>
        </div>

        <ul className="dash-legend">
          {completedOrders.map(order => (
            <li key={order.id || order.temp_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{order.patient_name}</strong> — <span style={{ color: 'var(--teal)' }}>{order.test_type}</span>
                <div style={{ fontSize: '12px', color: 'var(--ivory)', marginTop: '2px' }}>
                  <strong>Result:</strong> {order.results_summary} {order.lab_notes ? `(${order.lab_notes})` : ''}
                </div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'right' }}>
                Completed {order.completed_at ? new Date(order.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today'}
              </div>
            </li>
          ))}
          {completedOrders.length === 0 && (
            <li style={{ color: 'var(--muted)', fontSize: '13px' }}>No completed results recorded yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
