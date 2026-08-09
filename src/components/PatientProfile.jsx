import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOfflineTable } from '../lib/useOfflineTable'

const TABS = ['Overview', 'History', 'Prescriptions', 'Pharmacy', 'Billing', 'Edit Info']

// Full-screen patient dashboard, opened by clicking a patient anywhere in
// the app. Reuses the same offline-first tables every other module reads —
// nothing new is stored here except through those existing hooks.
export default function PatientProfile({ patientId, onClose }){
  const { profile, hospital } = useAuth()
  const { records: patients, updateRecord: updatePatient } = useOfflineTable('patients', hospital?.id)
  const { records: vitals } = useOfflineTable('patient_vitals', hospital?.id)
  const { records: prescriptions, updateRecord: updatePrescription } = useOfflineTable('prescriptions', hospital?.id)
  const { records: pharmacyItems, updateRecord: updatePharmacyItem } = useOfflineTable('pharmacy_items', hospital?.id)
  const { records: invoices, addRecord: addInvoice, updateRecord: updateInvoice } = useOfflineTable('invoices', hospital?.id)

  const [tab, setTab] = useState('Overview')
  const [toast, setToast] = useState(null)

  const patient = patients.find(p => p.id === patientId)

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  if (!patient) {
    return (
      <div style={overlayStyle}>
        <div style={{ ...panelStyle, textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
          Loading patient…
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    )
  }

  const history = vitals
    .filter(v => v.patient_id === patient.id && v.status === 'completed')
    .sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at))

  const patientPrescriptions = prescriptions
    .filter(rx => rx.patient_name === patient.full_name)
    .sort((a, b) => new Date(b.prescribed_at || b.created_at) - new Date(a.prescribed_at || a.created_at))

  const activePrescriptions = patientPrescriptions.filter(rx => rx.status === 'active')

  const patientInvoices = invoices
    .filter(inv => inv.patient_name === patient.full_name)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const outstandingBalance = patientInvoices.filter(inv => inv.status === 'unpaid').reduce((sum, inv) => sum + Number(inv.amount), 0)

  function findPharmacyMatch(drugName){
    if (!drugName) return null
    const q = drugName.toLowerCase()
    return pharmacyItems.find(item => {
      const n = item.name.toLowerCase()
      return n.includes(q) || q.includes(n)
    }) || null
  }

  async function handleDispense(rx){
    const match = findPharmacyMatch(rx.drug_name)
    if (match && Number(match.quantity) > 0) {
      await updatePharmacyItem(match.id, { quantity: Number(match.quantity) - 1 })
    }
    await updatePrescription(rx.id, { status: 'dispensed' })
    showToast(match ? `Dispensed ${rx.drug_name} — ${Math.max(Number(match.quantity) - 1, 0)} left in stock` : `Dispensed ${rx.drug_name}`)
  }

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '18px 20px', borderBottom: '1px solid var(--line-soft)' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{patient.full_name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {patient.age ? `${patient.age} yrs` : ''}{patient.gender ? ` · ${patient.gender}` : ''}{patient.hospital_number ? ` · #${patient.hospital_number}` : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', flexShrink: 0 }}
          >✕</button>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '12px 20px 0', overflowX: 'auto' }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flexShrink: 0, padding: '7px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: tab === t ? '1px solid var(--teal)' : '1px solid var(--line)',
                background: tab === t ? 'var(--teal-soft)' : 'transparent',
                color: tab === t ? 'var(--teal)' : 'var(--muted)',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          {tab === 'Overview' && (
            <OverviewTab patient={patient} latestConsultation={history[0]} activePrescriptions={activePrescriptions} outstandingBalance={outstandingBalance} />
          )}
          {tab === 'History' && <HistoryTab history={history} />}
          {tab === 'Prescriptions' && <PrescriptionsTab prescriptions={patientPrescriptions} />}
          {tab === 'Pharmacy' && (
            <PharmacyTab activePrescriptions={activePrescriptions} findPharmacyMatch={findPharmacyMatch} onDispense={handleDispense} />
          )}
          {tab === 'Billing' && (
            <BillingTab
              patient={patient} invoices={patientInvoices} outstandingBalance={outstandingBalance}
              profile={profile} addInvoice={addInvoice} updateInvoice={updateInvoice} showToast={showToast}
            />
          )}
          {tab === 'Edit Info' && (
            <EditInfoTab patient={patient} updatePatient={updatePatient} showToast={showToast} />
          )}
        </div>

        {toast && (
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)',
            padding: '10px 18px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, maxWidth: '85%', textAlign: 'center',
          }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 100,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
}
const panelStyle = {
  position: 'relative', width: '100%', maxWidth: 640, maxHeight: '88vh',
  background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 16,
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
}

function detailRow(label, value){
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{value || '—'}</div>
    </div>
  )
}

function OverviewTab({ patient, latestConsultation, activePrescriptions, outstandingBalance }){
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        {detailRow('Phone', patient.phone)}
        {detailRow('Blood Group / Genotype', [patient.blood_group, patient.genotype].filter(Boolean).join(' · '))}
        {detailRow('Address', patient.address)}
        {detailRow('Emergency Contact', patient.emergency_contact_name ? `${patient.emergency_contact_name}${patient.emergency_contact_phone ? ` — ${patient.emergency_contact_phone}` : ''}` : null)}
        {detailRow('Queue Status', patient.queue_status ? patient.queue_status.replace('_', ' ') : 'Not in queue')}
        {detailRow('Patient Status', patient.status === 'stable' ? 'Stable' : 'In Review')}
      </div>

      <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 20 }}>
        <div className="dash-stat-card">
          <div>
            <div className="dash-stat-label">Active Prescriptions</div>
            <div className="dash-stat-value">{activePrescriptions.length}</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div>
            <div className="dash-stat-label">Outstanding Balance</div>
            <div className="dash-stat-value" style={{ color: outstandingBalance > 0 ? 'var(--gold)' : undefined }}>₦{outstandingBalance.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {latestConsultation ? (
        <div style={{ padding: 14, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Latest Consultation</div>
          {latestConsultation.diagnoses?.length > 0 && (
            <div style={{ fontSize: 13, marginBottom: 4 }}><strong>Diagnosis:</strong> {latestConsultation.diagnoses.map(d => d.code ? `${d.label} (${d.code})` : d.label).join(', ')}</div>
          )}
          {latestConsultation.treatment_plan && <div style={{ fontSize: 13 }}><strong>Treatment Plan:</strong> {latestConsultation.treatment_plan}</div>}
        </div>
      ) : (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>No completed consultations yet.</div>
      )}
    </div>
  )
}

function HistoryTab({ history }){
  if (history.length === 0) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>No past consultations recorded.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {history.map(v => (
        <div key={v.id} style={{ padding: 14, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 6 }}>{new Date(v.completed_at || v.created_at).toLocaleString()}</div>
          {v.chief_complaints && <div style={{ fontSize: 13, marginBottom: 4 }}><strong>Chief Complaint:</strong> {v.chief_complaints}</div>}
          {v.diagnoses?.length > 0 && <div style={{ fontSize: 13, marginBottom: 4 }}><strong>Diagnosis:</strong> {v.diagnoses.map(d => d.code ? `${d.label} (${d.code})` : d.label).join(', ')}</div>}
          {v.treatment_plan && <div style={{ fontSize: 13, marginBottom: 4 }}><strong>Treatment Plan:</strong> {v.treatment_plan}</div>}
          {v.follow_up_notes && <div style={{ fontSize: 13 }}><strong>Follow-up:</strong> {v.follow_up_notes}</div>}
        </div>
      ))}
    </div>
  )
}

function PrescriptionsTab({ prescriptions }){
  if (prescriptions.length === 0) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>No prescriptions on record.</div>
  return (
    <ul className="dash-legend">
      {prescriptions.map(rx => (
        <li key={rx.id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '12px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <strong>{rx.drug_name}</strong>
            <span style={{
              fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
              background: rx.status === 'active' ? 'var(--teal-soft)' : rx.status === 'draft' ? 'rgba(201,169,97,0.14)' : 'rgba(255,255,255,0.06)',
              color: rx.status === 'active' ? 'var(--teal)' : rx.status === 'draft' ? 'var(--gold)' : 'var(--muted)',
            }}>
              {rx.status}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {rx.dosage}{rx.route ? ` · ${rx.route}` : ''}{rx.frequency ? ` · ${rx.frequency}` : ''}{rx.duration ? ` · ${rx.duration}` : ''}
          </div>
          {rx.instructions && <div style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic' }}>{rx.instructions}</div>}
        </li>
      ))}
    </ul>
  )
}

function PharmacyTab({ activePrescriptions, findPharmacyMatch, onDispense }){
  if (activePrescriptions.length === 0) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>No medications awaiting dispensing.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {activePrescriptions.map(rx => {
        const match = findPharmacyMatch(rx.drug_name)
        return (
          <div key={rx.id} style={{ padding: 14, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{rx.drug_name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{rx.dosage}{rx.frequency ? ` · ${rx.frequency}` : ''}</div>
                <div style={{ fontSize: 11.5, marginTop: 4, color: match ? (Number(match.quantity) > 0 ? 'var(--teal)' : 'var(--danger)') : 'var(--muted)' }}>
                  {match ? `${match.quantity} ${match.unit || 'units'} in stock` : 'Not tracked in pharmacy inventory'}
                </div>
              </div>
              <button className="btn btn-primary" style={{ width: 'auto', padding: '6px 14px', fontSize: 12 }} onClick={() => onDispense(rx)}>
                Dispense
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BillingTab({ patient, invoices, outstandingBalance, profile, addInvoice, updateInvoice, showToast }){
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAddCharge(e){
    e.preventDefault()
    if (!amount) return
    setSaving(true)
    try {
      await addInvoice({
        patient_name: patient.full_name,
        description: description || 'Charge',
        amount: parseFloat(amount),
        status: 'unpaid',
        created_by: profile?.id || null,
      })
      setDescription(''); setAmount('')
      showToast('Charge added')
    } catch (err) {
      showToast(err.message || 'Could not add charge')
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(inv){
    const newStatus = inv.status === 'paid' ? 'unpaid' : 'paid'
    await updateInvoice(inv.id, { status: newStatus })
    showToast(`Marked ${newStatus}`)
  }

  return (
    <div>
      <div style={{ marginBottom: 18, padding: 14, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Outstanding Balance</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: outstandingBalance > 0 ? 'var(--gold)' : 'var(--teal)' }}>₦{outstandingBalance.toLocaleString()}</div>
      </div>

      <form onSubmit={handleAddCharge} style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" style={{ flex: 2 }} />
        <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" type="number" style={{ flex: 1 }} />
        <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '0 16px' }} disabled={saving}>Add</button>
      </form>

      {invoices.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>No charges on record.</div>
      ) : (
        <ul className="dash-legend">
          {invoices.map(inv => (
            <li key={inv.id}>
              <span className="dash-legend-name">
                <span className="dash-legend-dot" style={{ background: inv.status === 'paid' ? 'var(--teal)' : 'var(--gold)' }} />
                {inv.description || 'Charge'}
              </span>
              <span
                onClick={() => toggleStatus(inv)}
                className="dash-legend-val"
                style={{ cursor: 'pointer', color: inv.status === 'paid' ? 'var(--teal)' : 'var(--gold)', fontWeight: 700 }}
                title="Tap to toggle paid/unpaid"
              >
                ₦{Number(inv.amount).toLocaleString()} · {inv.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EditInfoTab({ patient, updatePatient, showToast }){
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({
      full_name: patient.full_name || '',
      age: patient.age ?? '',
      gender: patient.gender || '',
      phone: patient.phone || '',
      blood_group: patient.blood_group || '',
      genotype: patient.genotype || '',
      emergency_contact_name: patient.emergency_contact_name || '',
      emergency_contact_phone: patient.emergency_contact_phone || '',
      address: patient.address || '',
      status: patient.status || 'stable',
    })
  }, [patient.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!form) return null

  async function handleSave(e){
    e.preventDefault()
    setSaving(true)
    try {
      await updatePatient(patient.id, {
        full_name: form.full_name,
        age: form.age === '' ? null : parseInt(form.age, 10),
        gender: form.gender || null,
        phone: form.phone || null,
        blood_group: form.blood_group || null,
        genotype: form.genotype || null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
        address: form.address || null,
        status: form.status,
      })
      showToast('Patient details updated')
    } catch (err) {
      showToast(err.message || 'Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave}>
      <div className="field">
        <label>Full Name</label>
        <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="field">
          <label>Age</label>
          <input type="number" value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} />
        </div>
        <div className="field">
          <label>Gender</label>
          <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
            <option value="">—</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>
        <div className="field">
          <label>Phone</label>
          <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
        <div className="field">
          <label>Patient Status</label>
          <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            <option value="stable">Stable</option>
            <option value="review">In Review</option>
          </select>
        </div>
        <div className="field">
          <label>Blood Group</label>
          <input value={form.blood_group} onChange={e => setForm(f => ({ ...f, blood_group: e.target.value }))} placeholder="e.g. O+" />
        </div>
        <div className="field">
          <label>Genotype</label>
          <input value={form.genotype} onChange={e => setForm(f => ({ ...f, genotype: e.target.value }))} placeholder="e.g. AA" />
        </div>
        <div className="field">
          <label>Emergency Contact Name</label>
          <input value={form.emergency_contact_name} onChange={e => setForm(f => ({ ...f, emergency_contact_name: e.target.value }))} />
        </div>
        <div className="field">
          <label>Emergency Contact Phone</label>
          <input value={form.emergency_contact_phone} onChange={e => setForm(f => ({ ...f, emergency_contact_phone: e.target.value }))} />
        </div>
      </div>
      <div className="field">
        <label>Address</label>
        <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
    </form>
  )
}
