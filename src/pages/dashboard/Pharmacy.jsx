import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOfflineTable } from '../../lib/useOfflineTable';

export default function Pharmacy() {
  const { hospital } = useAuth();

  // Load Prescriptions from Doctor Workbench and Inventory
  const { data: prescriptions, updateRow: updatePrescription } = useOfflineTable('prescriptions', hospital?.id);
  const { data: inventory, insertRow: addDrug, updateRow: updateDrug } = useOfflineTable('pharmacy_inventory', hospital?.id);
  const { insertRow: addInvoice } = useOfflineTable('invoices', hospital?.id);

  // New Drug Form State
  const [newDrug, setNewDrug] = useState({
    drug_name: '',
    category: 'Analgesics',
    quantity: '',
    unit_price: '',
    reorder_level: '10'
  });

  const [dispenseQty, setDispenseQty] = useState({});

  const pendingPrescriptions = prescriptions ? prescriptions.filter(p => p.status === 'pending') : [];

  const handleAddDrug = async (e) => {
    e.preventDefault();
    if (!newDrug.drug_name || !newDrug.quantity) return;

    await addDrug({
      hospital_id: hospital?.id,
      drug_name: newDrug.drug_name,
      category: newDrug.category,
      quantity: Number(newDrug.quantity),
      unit_price: Number(newDrug.unit_price) || 0,
      reorder_level: Number(newDrug.reorder_level) || 10
    });

    setNewDrug({ drug_name: '', category: 'Analgesics', quantity: '', unit_price: '', reorder_level: '10' });
  };

  const handleDispense = async (prescription) => {
    const qtyToDispense = Number(dispenseQty[prescription.id]) || 1;

    // 1. Find drug in inventory to match stock and price
    const matchedDrug = inventory?.find(i => 
      i.drug_name.toLowerCase().includes(prescription.medication_name.toLowerCase()) ||
      prescription.medication_name.toLowerCase().includes(i.drug_name.toLowerCase())
    );

    // 2. Mark prescription dispensed
    await updatePrescription(prescription.id, { status: 'dispensed' });

    // 3. Deduct stock if drug found in inventory
    if (matchedDrug) {
      const updatedStock = Math.max(0, Number(matchedDrug.quantity) - qtyToDispense);
      await updateDrug(matchedDrug.id, { quantity: updatedStock });
    }

    // 4. Auto-bill patient in Billing module
    const itemPrice = matchedDrug ? Number(matchedDrug.unit_price) * qtyToDispense : 1000;
    await addInvoice({
      hospital_id: hospital?.id,
      patient_id: prescription.patient_id,
      patient_name: prescription.patient_name,
      description: `Pharmacy: ${prescription.medication_name} (x${qtyToDispense})`,
      amount: itemPrice,
      status: 'unpaid'
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontFamily: 'var(--font-display)' }}>Pharmacy & Dispensing Station</h1>
        <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Fulfill doctor prescriptions, auto-deduct inventory, and send bills to checkout</p>
      </div>

      <div className="dash-row dash-row-2">
        {/* DOCTOR PRESCRIPTIONS QUEUE */}
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">Doctor Prescriptions Queue ({pendingPrescriptions.length})</div>
          </div>

          <ul className="dash-legend">
            {pendingPrescriptions.map((p) => (
              <li key={p.id || p.temp_id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px', padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <strong>{p.patient_name}</strong>
                  <span style={{ fontSize: '11px', color: 'var(--gold)', fontWeight: '700' }}>PENDING</span>
                </div>

                <div style={{ fontSize: '13px', color: 'var(--teal)', fontWeight: 'bold' }}>
                  💊 {p.medication_name} — <span style={{ color: 'var(--ivory)', fontWeight: 'normal' }}>{p.dosage || 'Standard dose'}</span>
                </div>

                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  Prescribed by: {p.doctor_name || 'Medical Doctor'}
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', marginTop: '4px' }}>
                  <input 
                    type="number" 
                    placeholder="Qty" 
                    defaultValue="1"
                    style={{ width: '70px', padding: '4px 8px', fontSize: '12px' }}
                    onChange={e => setDispenseQty({ ...dispenseQty, [p.id]: e.target.value })}
                  />
                  <button 
                    className="btn btn-primary" 
                    style={{ padding: '6px 12px', fontSize: '12px', flex: 1 }}
                    onClick={() => handleDispense(p)}
                  >
                    Dispense & Auto-Bill
                  </button>
                </div>
              </li>
            ))}
            {pendingPrescriptions.length === 0 && (
              <li style={{ color: 'var(--muted)', fontSize: '13px' }}>No pending doctor prescriptions.</li>
            )}
          </ul>
        </div>

        {/* DRUG INVENTORY & ADD FORM */}
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">Add Stock & Inventory</div>
          </div>

          <form onSubmit={handleAddDrug} style={{ marginBottom: '20px' }}>
            <div className="field">
              <label>Drug / Medicine Name *</label>
              <input 
                type="text" 
                required 
                placeholder="e.g. Paracetamol 500mg" 
                value={newDrug.drug_name} 
                onChange={e => setNewDrug({ ...newDrug, drug_name: e.target.value })} 
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="field">
                <label>Category</label>
                <select value={newDrug.category} onChange={e => setNewDrug({ ...newDrug, category: e.target.value })}>
                  <option value="Analgesics">Analgesics</option>
                  <option value="Antibiotics">Antibiotics</option>
                  <option value="Antimalarial">Antimalarial</option>
                  <option value="Vitamins">Vitamins</option>
                  <option value="Syrups">Syrups</option>
                </select>
              </div>
              <div className="field">
                <label>Stock Quantity *</label>
                <input 
                  type="number" 
                  required 
                  placeholder="100" 
                  value={newDrug.quantity} 
                  onChange={e => setNewDrug({ ...newDrug, quantity: e.target.value })} 
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="field">
                <label>Unit Price (₦)</label>
                <input 
                  type="number" 
                  placeholder="500" 
                  value={newDrug.unit_price} 
                  onChange={e => setNewDrug({ ...newDrug, unit_price: e.target.value })} 
                />
              </div>
              <div className="field">
                <label>Reorder Alert Level</label>
                <input 
                  type="number" 
                  value={newDrug.reorder_level} 
                  onChange={e => setNewDrug({ ...newDrug, reorder_level: e.target.value })} 
                />
              </div>
            </div>

            <button type="submit" className="btn btn-ghost" style={{ width: '100%' }}>
              + Add to Stock
            </button>
          </form>

          <div className="dash-panel-title" style={{ fontSize: '13px', marginBottom: '8px' }}>Current Drug Stock List</div>
          <ul className="dash-legend">
            {inventory && inventory.map((item) => (
              <li key={item.id || item.temp_id}>
                <div className="dash-legend-name">
                  <span 
                    className="dash-legend-dot" 
                    style={{ background: Number(item.quantity) <= Number(item.reorder_level) ? 'var(--danger)' : 'var(--teal)' }} 
                  />
                  <strong>{item.drug_name}</strong> ({item.category})
                </div>
                <div className="dash-legend-val">
                  Stock: <strong>{item.quantity}</strong> | ₦{Number(item.unit_price).toLocaleString()}
                </div>
              </li>
            ))}
            {(!inventory || inventory.length === 0) && (
              <li style={{ color: 'var(--muted)', fontSize: '13px' }}>No stock added to inventory yet.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
