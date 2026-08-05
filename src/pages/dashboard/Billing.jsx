import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOfflineTable } from '../../lib/useOfflineTable';

export default function Billing() {
  const { hospital } = useAuth();

  const { data: patients } = useOfflineTable('patients', hospital?.id);
  const { data: invoices, insertRow: addInvoice, updateRow: updateInvoice } = useOfflineTable('invoices', hospital?.id);

  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [description, setDescription] = useState('Doctor Consultation Fee');
  const [amount, setAmount] = useState(hospital?.default_consultation_fee || 5000);
  const [activeInvoiceForPrint, setActiveInvoiceForPrint] = useState(null);

  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    if (!selectedPatientId || !amount) return;

    const patient = patients.find(p => p.id === selectedPatientId);

    await addInvoice({
      hospital_id: hospital?.id,
      patient_id: selectedPatientId,
      patient_name: patient ? patient.full_name : 'Walk-in Patient',
      description,
      amount: Number(amount),
      status: 'unpaid'
    });

    setSelectedPatientId('');
    setDescription('Doctor Consultation Fee');
    setAmount(hospital?.default_consultation_fee || 5000);
  };

  const handlePrint = (inv) => {
    setActiveInvoiceForPrint(inv);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontFamily: 'var(--font-display)' }}>Billing & Custom Invoice Printing</h1>
        <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Issue payment requests, collect fees, and print official branded receipts</p>
      </div>

      <div className="dash-row dash-row-2">
        {/* ISSUE NEW INVOICE */}
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">Issue New Invoice</div>
          </div>

          <form onSubmit={handleCreateInvoice}>
            <div className="field">
              <label>Select Patient *</label>
              <select 
                value={selectedPatientId} 
                onChange={e => setSelectedPatientId(e.target.value)} 
                required
              >
                <option value="">-- Choose Patient --</option>
                {patients && patients.map(p => (
                  <option key={p.id || p.temp_id} value={p.id}>
                    {p.full_name} ({p.hospital_number || 'No ID'})
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Billing Description *</label>
              <input 
                type="text" 
                required 
                placeholder="e.g. Consultation + Lab Test" 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
              />
            </div>

            <div className="field">
              <label>Amount (₦) *</label>
              <input 
                type="number" 
                required 
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }}>
              Generate Bill
            </button>
          </form>
        </div>

        {/* RECENT INVOICES LIST */}
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">Invoices Directory ({invoices ? invoices.length : 0})</div>
          </div>

          <ul className="dash-legend">
            {invoices && invoices.map((inv) => (
              <li key={inv.id || inv.temp_id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px', padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <strong>{inv.patient_name}</strong>
                  <span style={{ 
                    fontSize: '10px', 
                    padding: '2px 8px', 
                    borderRadius: '10px', 
                    background: inv.status === 'paid' ? 'var(--teal-soft)' : 'var(--danger-soft)',
                    color: inv.status === 'paid' ? 'var(--teal)' : 'var(--danger)' 
                  }}>
                    {inv.status ? inv.status.toUpperCase() : 'UNPAID'}
                  </span>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  {inv.description} — <strong style={{ color: 'var(--ivory)' }}>₦{Number(inv.amount).toLocaleString()}</strong>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end', marginTop: '4px' }}>
                  {inv.status !== 'paid' && (
                    <button 
                      className="btn btn-ghost" 
                      style={{ padding: '4px 8px', fontSize: '11px' }}
                      onClick={() => updateInvoice(inv.id, { status: 'paid' })}
                    >
                      Mark Paid
                    </button>
                  )}
                  <button 
                    className="btn btn-primary" 
                    style={{ padding: '4px 8px', fontSize: '11px' }}
                    onClick={() => handlePrint(inv)}
                  >
                    🖨️ Print Receipt
                  </button>
                </div>
              </li>
            ))}
            {(!invoices || invoices.length === 0) && (
              <li style={{ color: 'var(--muted)', fontSize: '13px' }}>No invoices issued yet.</li>
            )}
          </ul>
        </div>
      </div>

      {/* HIDDEN PRINT-ONLY RECEIPT DOM ELEMENT */}
      {activeInvoiceForPrint && (
        <div id="print-receipt-section" style={{ display: 'none' }}>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #print-receipt-section, #print-receipt-section * { visibility: visible; }
              #print-receipt-section { 
                position: absolute; 
                left: 0; 
                top: 0; 
                width: 100%; 
                display: block !important; 
                padding: 20px;
                background: #fff;
                color: #000;
                font-family: Arial, sans-serif;
              }
            }
          `}</style>

          <div style={{ borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '15px' }}>
            <h2 style={{ margin: 0 }}>{hospital?.name || 'HOSPITAL NAME'}</h2>
            <p style={{ margin: '4px 0', fontSize: '12px' }}>{hospital?.address || ''}</p>
            <p style={{ margin: 0, fontSize: '12px' }}>Tel: {hospital?.phone || 'N/A'}</p>
          </div>

          <h3 style={{ textTransform: 'uppercase', fontSize: '14px', marginBottom: '15px' }}>
            {hospital?.invoice_header || 'OFFICIAL RECEIPT'}
          </h3>

          <p><strong>Patient:</strong> {activeInvoiceForPrint.patient_name}</p>
          <p><strong>Date:</strong> {new Date().toLocaleDateString()}</p>
          <p><strong>Status:</strong> {activeInvoiceForPrint.status?.toUpperCase()}</p>

          <table style={{ width: '100%', borderCollapse: 'collapse', margin: '20px 0' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #000' }}>
                <th style={{ textAlign: 'left' }}>Description</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{activeInvoiceForPrint.description}</td>
                <td style={{ textAlign: 'right' }}>₦{Number(activeInvoiceForPrint.amount).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ textAlign: 'right' }}>Total: ₦{Number(activeInvoiceForPrint.amount).toLocaleString()}</h3>

          <p style={{ textAlign: 'center', marginTop: '30px', fontSize: '12px', borderTop: '1px solid #ccc', paddingTop: '10px' }}>
            {hospital?.invoice_footer || 'Thank you!'}
          </p>
        </div>
      )}
    </div>
  );
}
