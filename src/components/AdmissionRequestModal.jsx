import { useState } from 'react'

const ADMISSION_TYPES = ['Emergency', 'Urgent', 'Routine', 'Elective']
const PRIORITIES = ['Emergency', 'High', 'Normal', 'Low']
const BED_TYPES = ['General', 'Private', 'Semi-Private', 'ICU', 'Isolation', 'Pediatric', 'Maternity']

const EMPTY_FORM = {
  diagnosis: '',
  reason: '',
  admission_type: 'Routine',
  priority: 'Normal',
  requested_ward: '',
  requested_bed_type: '',
  expected_los: '',
  isolation_required: false,
  special_instructions: '',
  clinical_notes: '',
}

// Props:
// - patient: the active patient record
// - consultationId: activeVitals.id (nullable)
// - prefillDiagnosis: string, e.g. from the consultation's diagnoses list
// - onSubmit(payload): async fn called with the admission_requests payload
// - onClose(): fn to close the modal
export default function AdmissionRequestModal({ patient, consultationId, prefillDiagnosis, onSubmit, onClose }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, diagnosis: prefillDiagnosis || '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.reason.trim()) {
      setError('Reason for admission is required')
      return
    }
    setError('')
    setSaving(true)
    try {
      await onSubmit({
        consultation_id: consultationId || null,
        diagnosis: form.diagnosis || null,
        reason: form.reason,
        admission_type: form.admission_type,
        priority: form.priority,
        requested_ward: form.requested_ward || null,
        requested_bed_type: form.requested_bed_type || null,
        expected_los: form.expected_los || null,
        isolation_required: form.isolation_required,
        special_instructions: form.special_instructions || null,
        clinical_notes: form.clinical_notes || null,
      })
    } catch (err) {
      setError(err.message || 'Could not submit admission recommendation')
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 80,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 16px', overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        className="dash-panel"
        style={{ maxWidth: 560, width: '100%', margin: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Recommend Admission</div>
            <div className="dash-panel-sub">{patient?.full_name || 'Patient'}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, width: 28, height: 28, cursor: 'pointer' }}
          >✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Diagnosis</label>
            <input value={form.diagnosis} onChange={e => set('diagnosis', e.target.value)} placeholder="e.g. Pneumonia" />
          </div>

          <div className="field">
            <label>Reason for Admission *</label>
            <textarea rows={2} value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="e.g. Requires inpatient treatment and monitoring" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label>Admission Type</label>
              <select value={form.admission_type} onChange={e => set('admission_type', e.target.value)}>
                {ADMISSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Priority</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Requested Ward</label>
              <input value={form.requested_ward} onChange={e => set('requested_ward', e.target.value)} placeholder="e.g. Medical Ward" />
            </div>
            <div className="field">
              <label>Requested Bed Type</label>
              <select value={form.requested_bed_type} onChange={e => set('requested_bed_type', e.target.value)}>
                <option value="">Select…</option>
                {BED_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Expected Length of Stay</label>
              <input value={form.expected_los} onChange={e => set('expected_los', e.target.value)} placeholder="e.g. 3-5 days" />
            </div>
            <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 22 }}>
              <input
                type="checkbox"
                id="isolation_required"
                checked={form.isolation_required}
                onChange={e => set('isolation_required', e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <label htmlFor="isolation_required" style={{ margin: 0 }}>Isolation required</label>
            </div>
          </div>

          <div className="field">
            <label>Special Instructions</label>
            <input value={form.special_instructions} onChange={e => set('special_instructions', e.target.value)} placeholder="Optional" />
          </div>

          <div className="field">
            <label>Clinical Notes</label>
            <textarea rows={2} value={form.clinical_notes} onChange={e => set('clinical_notes', e.target.value)} placeholder="Optional" />
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 10 }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={saving}>
              {saving ? 'Submitting…' : 'Submit Recommendation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
