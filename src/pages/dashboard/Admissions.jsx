import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'

// Section 5 — stats row
// Section 6 — Requests list
// Section 7 — Review screen (approve w/ bed assignment, or reject)

const EDITOR_ROLES = ['doctor', 'nurse', 'admin', 'owner']

const PRIORITY_LABELS = { urgent: 'Urgent', routine: 'Routine', scheduled: 'Scheduled' }

export default function Admissions(){
  const { hospital, profile } = useAuth()
  const canEdit = EDITOR_ROLES.includes(profile?.role)

  const { records: admissionRequests, loading: loadingRequests, updateRecord: updateRequest } = useOfflineTable('admission_requests', hospital?.id)
  const { records: admissions, loading: loadingAdmissions, addRecord: addAdmission } = useOfflineTable('admissions', hospital?.id)
  const { records: beds, loading: loadingBeds, updateRecord: updateBed } = useOfflineTable('beds', hospital?.id)

  const loading = loadingRequests || loadingAdmissions || loadingBeds
  const todayStr = new Date().toDateString()

  const pendingRequests = admissionRequests.filter(r => r.status === 'pending').length
  const approvedRequests = admissionRequests.filter(r => r.status === 'approved').length
  const admittedToday = admissions.filter(a => new Date(a.admitted_at).toDateString() === todayStr).length
  const currentlyAdmitted = admissions.filter(a => a.status === 'active').length
  const availableBeds = beds.filter(b => b.status === 'available').length
  const occupiedBeds = beds.filter(b => b.status === 'occupied').length
  const pendingCleaning = beds.filter(b => b.status === 'cleaning').length

  const stats = [
    { label: 'Pending Requests', value: pendingRequests, color: 'var(--gold)' },
    { label: 'Approved Requests', value: approvedRequests, color: 'var(--teal)' },
    { label: 'Admitted Today', value: admittedToday, color: 'var(--teal)' },
    { label: 'Currently Admitted', value: currentlyAdmitted, color: 'var(--blue)' },
    { label: 'Available Beds', value: availableBeds, color: 'var(--muted)' },
    { label: 'Occupied Beds', value: occupiedBeds, color: 'var(--blue)' },
    { label: 'Pending Cleaning', value: pendingCleaning, color: 'var(--gold)' },
  ]

  // --- Section 6: Requests list ---
  const [filter, setFilter] = useState('pending')
  const filteredRequests = admissionRequests
    .filter(r => filter === 'all' || r.status === filter)
    .sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at))

  // --- Section 7: Review screen ---
  const [reviewing, setReviewing] = useState(null) // the request being reviewed
  const [selectedBedId, setSelectedBedId] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [mode, setMode] = useState(null) // 'approve' | 'reject' | null
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function openReview(request){
    setReviewing(request)
    setSelectedBedId('')
    setRejectReason('')
    setMode(null)
  }

  function closeReview(){
    setReviewing(null)
    setSelectedBedId('')
    setRejectReason('')
    setMode(null)
  }

  async function handleApprove(){
    if (!reviewing || !selectedBedId) return
    setBusy(true)
    try {
      await addAdmission({
        request_id: reviewing.id,
        patient_id: reviewing.patient_id,
        patient_name: reviewing.patient_name,
        bed_id: selectedBedId,
        admitted_at: new Date().toISOString(),
        admitted_by: profile.id,
        status: 'active',
      })
      await updateBed(selectedBedId, { status: 'occupied' })
      await updateRequest(reviewing.id, {
        status: 'approved',
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
      })
      showToast(`${reviewing.patient_name} admitted`)
      closeReview()
    } catch (err) {
      showToast(err.message || 'Could not complete admission')
    } finally {
      setBusy(false)
    }
  }

  async function handleReject(){
    if (!reviewing || !rejectReason.trim()) return
    setBusy(true)
    try {
      await updateRequest(reviewing.id, {
        status: 'rejected',
        rejection_reason: rejectReason.trim(),
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
      })
      showToast(`Request for ${reviewing.patient_name} rejected`)
      closeReview()
    } catch (err) {
      showToast(err.message || 'Could not reject request')
    } finally {
      setBusy(false)
    }
  }

  const availableBedOptions = beds.filter(b => b.status === 'available')

  return (
    <div>
      <div className="dash-panel" style={{ marginBottom: 16 }}>
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Admissions</div>
            <div className="dash-panel-sub">
              Requests, bed assignment, and active admissions
              {!canEdit && <span style={{ marginLeft: 8, opacity: .7 }}>· View only</span>}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="dash-panel" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
      ) : (
        <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 20 }}>
          {stats.map(s => (
            <div className="dash-stat-card" key={s.label}>
              <div>
                <div className="dash-stat-label">{s.label}</div>
                <div className="dash-stat-value" style={{ color: s.color }}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Section 6: Requests list */}
      <div className="dash-panel">
        <div className="dash-panel-head">
          <div className="dash-panel-title">Admission Requests</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['pending', 'approved', 'rejected', 'all'].map(f => (
              <button
                key={f}
                className={`btn btn-ghost ${filter === f ? 'active' : ''}`}
                style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {filteredRequests.length === 0 ? (
          <div className="dash-empty">No {filter === 'all' ? '' : filter} requests.</div>
        ) : (
          <table className="dash-full-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Requested By</th>
                <th>Department</th>
                <th>Priority</th>
                <th>Requested At</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map(r => (
                <tr key={r.id}>
                  <td>{r.patient_name}</td>
                  <td>{r.requested_by_name || '—'}</td>
                  <td>{r.department || '—'}</td>
                  <td>{PRIORITY_LABELS[r.priority] || r.priority || '—'}</td>
                  <td>{r.requested_at ? new Date(r.requested_at).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td><span className={`dash-status ${r.status === 'pending' ? 'review' : 'stable'}`}>{r.status}</span></td>
                  <td>
                    <button className="btn btn-ghost" style={{ width: 'auto', padding: '4px 10px' }} onClick={() => openReview(r)}>
                      {canEdit && r.status === 'pending' ? 'Review' : 'View'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Section 7: Review screen */}
      {reviewing && (
        <div className="dash-modal-backdrop">
          <div className="card dash-modal">
            <div className="dash-modal-title">
              {canEdit && reviewing.status === 'pending' ? 'Review Request' : 'Request Details'}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div className="field"><label>Patient</label><div>{reviewing.patient_name}</div></div>
              <div className="field"><label>Requested By</label><div>{reviewing.requested_by_name || '—'}</div></div>
              <div className="field"><label>Department</label><div>{reviewing.department || '—'}</div></div>
              <div className="field"><label>Priority</label><div>{PRIORITY_LABELS[reviewing.priority] || reviewing.priority || '—'}</div></div>
              <div className="field"><label>Reason</label><div>{reviewing.reason || '—'}</div></div>
              <div className="field"><label>Status</label><div><span className={`dash-status ${reviewing.status === 'pending' ? 'review' : 'stable'}`}>{reviewing.status}</span></div></div>
              {reviewing.status === 'rejected' && reviewing.rejection_reason && (
                <div className="field"><label>Rejection Reason</label><div>{reviewing.rejection_reason}</div></div>
              )}
            </div>

            {canEdit && reviewing.status === 'pending' && (
              <>
                {mode === null && (
                  <div className="dash-modal-actions">
                    <button className="btn btn-ghost" onClick={closeReview}>Close</button>
                    <button className="btn btn-ghost dash-danger-btn" onClick={() => setMode('reject')}>Reject</button>
                    <button className="btn btn-primary" onClick={() => setMode('approve')}>Approve</button>
                  </div>
                )}

                {mode === 'approve' && (
                  <>
                    <div className="field">
                      <label>Assign Bed</label>
                      <select value={selectedBedId} onChange={e => setSelectedBedId(e.target.value)}>
                        <option value="">Select an available bed…</option>
                        {availableBedOptions.map(b => (
                          <option key={b.id} value={b.id}>{b.label || b.number || b.id}{b.ward ? ` — ${b.ward}` : ''}</option>
                        ))}
                      </select>
                      {availableBedOptions.length === 0 && (
                        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>No beds currently available.</div>
                      )}
                    </div>
                    <div className="dash-modal-actions">
                      <button className="btn btn-ghost" onClick={() => setMode(null)} disabled={busy}>Back</button>
                      <button className="btn btn-primary" onClick={handleApprove} disabled={busy || !selectedBedId}>
                        {busy ? 'Admitting…' : 'Confirm Admission'}
                      </button>
                    </div>
                  </>
                )}

                {mode === 'reject' && (
                  <>
                    <div className="field">
                      <label>Reason for Rejection</label>
                      <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. No bed capacity, insufficient info…" />
                    </div>
                    <div className="dash-modal-actions">
                      <button className="btn btn-ghost" onClick={() => setMode(null)} disabled={busy}>Back</button>
                      <button className="btn btn-primary dash-danger-btn" onClick={handleReject} disabled={busy || !rejectReason.trim()}>
                        {busy ? 'Rejecting…' : 'Confirm Rejection'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {(!canEdit || reviewing.status !== 'pending') && (
              <div className="dash-modal-actions">
                <button className="btn btn-ghost" onClick={closeReview}>Close</button>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <div className="dash-toast">{toast}</div>}
    </div>
  )
}
