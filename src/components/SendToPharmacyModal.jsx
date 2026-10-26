import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOfflineTable } from '../lib/useOfflineTable'
import { writeAudit } from '../lib/audit'
import { ROLE_LABELS } from '../lib/permissions'
import { rxSummary } from '../lib/pharmacyRequests'

const OTHER = '__other'

// "Send to Pharmacy" for one patient. The staff member picks one of the
// patient's ACTIVE prescriptions and says how many to request. Every request is
// saved as its own row (who asked, what, how many), so:
//   - the pharmacist sees exactly who requested what for which patient, and
//   - the amount still available on the prescription goes down automatically.
// A drug that is not on any active prescription can still be requested; it is
// flagged "not prescribed" for the pharmacist.
export default function SendToPharmacyModal({ patient, onClose, onSent }) {
  const { profile, hospital } = useAuth()
  const { records: prescriptions } = useOfflineTable('prescriptions', hospital?.id)
  const { records: requests, addRecord: addRequest } = useOfflineTable('pharmacy_requests', hospital?.id)

  const activeRx = useMemo(
    () => prescriptions
      .filter((p) => p.patient_id === patient.id && p.status === 'active')
      .sort((a, b) => new Date(a.prescribed_at || 0) - new Date(b.prescribed_at || 0)),
    [prescriptions, patient.id]
  )

  const [choice, setChoice] = useState('')
  const [otherDrug, setOtherDrug] = useState('')
  const [qty, setQty] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Until the person picks something, default to the first active prescription
  // (or "other drug" when the patient has none).
  const selected = choice || (activeRx[0]?.id ?? OTHER)
  const rx = selected === OTHER ? null : activeRx.find((p) => p.id === selected) || null
  const summary = rx ? rxSummary(rx, requests) : null
  const qtyNum = parseInt(qty, 10)
  const left = summary?.remaining
  const overLimit = Boolean(rx && left != null && Number.isFinite(qtyNum) && qtyNum > Math.max(0, left))

  function optionLabel(p) {
    const s = rxSummary(p, requests)
    const tail = s.remaining == null ? 'quantity not counted' : `${Math.max(0, s.remaining)} of ${s.total} left`
    return `${p.drug_name}${p.dosage ? ` · ${p.dosage}` : ''} — ${tail}`
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (saving) return
    setError('')
    const drugName = rx ? rx.drug_name : otherDrug.trim()
    if (!drugName) { setError('Enter the drug name.'); return }
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) { setError('Enter a whole number greater than zero for the quantity.'); return }

    setSaving(true)
    try {
      await addRequest({
        patient_id: patient.id,
        patient_name: patient.full_name,
        prescription_id: rx ? rx.id : null,
        drug_name: drugName,
        quantity: qtyNum,
        notes: notes.trim() || null,
        not_prescribed: !rx,
        exceeds_remaining: overLimit,
        status: 'requested',
        requested_by: profile?.id || null,
        requested_by_name: profile?.full_name || null,
        requested_by_role: profile?.role || null,
      })
      const who = `${ROLE_LABELS[profile?.role] || 'Staff'} ${profile?.full_name || ''}`.trim()
      writeAudit({
        hospitalId: hospital?.id, actor: profile,
        action: 'pharmacy.requested',
        entityType: 'prescription', entityId: rx?.id || null,
        patientId: patient.id,
        summary: `${who} requested ${qtyNum} × ${drugName} from pharmacy for ${patient.full_name}${rx ? '' : ' (not prescribed)'}`,
        metadata: { drug_name: drugName, quantity: qtyNum, prescription_id: rx?.id || null, not_prescribed: !rx, exceeds_remaining: overLimit },
      })
      if (onSent) onSent(`${qtyNum} × ${drugName} requested from Pharmacy for ${patient.full_name}`)
      onClose()
    } catch (err) {
      setError(err.message || 'Could not send to pharmacy.')
    } finally {
      setSaving(false)
    }
  }

  const warnStyle = { fontSize: 12, color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 8, padding: '8px 10px', marginTop: 8 }

  return (
    <div className="dash-modal-backdrop" style={{ zIndex: 80 }} onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className="card dash-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="dash-modal-title">Send to Pharmacy</div>
        <div className="dash-modal-body">
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
            For <strong style={{ color: 'var(--teal)' }}>{patient.full_name}</strong>
          </div>
          {error && <div className="error-box" role="alert" style={{ marginBottom: 12 }}>{error}</div>}

          <form id="send-pharmacy-form" onSubmit={handleSubmit}>
            <div className="field">
              <label>Prescription</label>
              <select value={selected} onChange={(e) => setChoice(e.target.value)} disabled={saving}>
                {activeRx.map((p) => <option key={p.id} value={p.id}>{optionLabel(p)}</option>)}
                <option value={OTHER}>Other drug (not prescribed)</option>
              </select>
              {activeRx.length === 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
                  This patient has no active prescription. You can still send a request; the pharmacist will see it marked "not prescribed".
                </div>
              )}
            </div>

            {!rx && (
              <div className="field">
                <label>Drug name *</label>
                <input value={otherDrug} onChange={(e) => setOtherDrug(e.target.value)} placeholder="e.g. Paracetamol 500mg" autoFocus disabled={saving} />
                <div style={warnStyle}>Not on an active prescription. It will be flagged "not prescribed" for the pharmacist.</div>
              </div>
            )}

            {rx && summary && (
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--muted)', margin: '-4px 0 12px' }}>
                {summary.total == null ? (
                  <span>Prescribed: {rx.quantity || 'no quantity'} (not counted)</span>
                ) : (
                  <>
                    <span>Prescribed: <b style={{ color: 'var(--ivory)' }}>{summary.total}</b></span>
                    <span>Requested: <b style={{ color: 'var(--ivory)' }}>{summary.requested}</b></span>
                    <span>Left: <b style={{ color: Math.max(0, summary.remaining) === 0 ? 'var(--warning)' : 'var(--ivory)' }}>{Math.max(0, summary.remaining)}</b></span>
                  </>
                )}
              </div>
            )}

            <div className="field">
              <label>Quantity to request *</label>
              <input type="number" inputMode="numeric" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 3" required disabled={saving} />
              {overLimit && (
                <div style={warnStyle}>
                  This is more than the {Math.max(0, left)} left on the prescription. You can still send it; the pharmacist will see a warning.
                </div>
              )}
            </div>

            <div className="field">
              <label>Notes (optional)</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. For headache, give TDS" disabled={saving} />
            </div>
          </form>
        </div>
        <div className="dash-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="send-pharmacy-form" className="btn btn-primary" disabled={saving}>{saving ? 'Sending…' : 'Send to Pharmacy'}</button>
        </div>
      </div>
    </div>
  )
}
