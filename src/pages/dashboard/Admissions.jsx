import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'

// Section 5 — stats row
// Section 6 — Requests list
// Section 7 — Review screen (approve w/ bed assignment, or reject)
// Section 8 — Discharge flow (checklist + discharge + bed cleaning)

const EDITOR_ROLES = ['doctor', 'nurse', 'admin', 'owner']

const PRIORITY_LABELS = { urgent: 'Urgent', routine: 'Routine', scheduled: 'Scheduled' }
const ADMISSION_TYPE_LABELS = { emergency: 'Emergency', elective: 'Elective', transfer: 'Transfer' }

export default function Admissions(){
  const { hospital, profile } = useAuth()
  const canEdit = EDITOR_ROLES.includes(profile?.role)
  const canToggleBilling = canEdit || profile?.role === 'billing'
  const canTogglePharmacy = canEdit || profile?.role === 'pharmacist'

  const { records: admissionRequests, loading: loadingRequests, updateRecord: updateRequest } = useOfflineTable('admission_requests', hospital?.id)
  const { records: admissions, loading: loadingAdmissions, addRecord: addAdmission, updateRecord: updateAdmission } = useOfflineTable('admissions', hospital?.id)
  const { records: beds, loading: loadingBeds, updateRecord: updateBed } = useOfflineTable('beds', hospital?.id)
  const { records: patients, loading: loadingPatients } = useOfflineTable('patients', hospital?.id)

  const loading = loadingRequests || loadingAdmissions || loadingBeds || loadingPatients
  const todayStr = new Date().toDateString()

  const patientName = (patientId) => patients.find(p => p.id === patientId)?.full_name || 'Unknown Patient'
  const bedById = (bedId) => beds.find(b => b.id === bedId)

  const pendingRequests = admissionRequests.filter(r => r.status === 'pending').length
  const approvedRequests = admissionRequests.filter(r => r.status === 'approved').length
  const admittedToday = admissions.filter(a => a.admitted_at && new Date(a.admitted_at).toDateString() === todayStr).length
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

  const [toast, setToast] = useState(null)
  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // --- Section 6: Requests list ---
  const [filter, setFilter] = useState('pending')
  const filteredRequests = admissionRequests
    .filter(r => filter === 'all' || r.status === filter)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  // --- Section 7: Review screen ---
  const [reviewing, setReviewing] = useState(null)
  const [selectedBedId, setSelectedBedId] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [mode, setMode] = useState(null) // 'approve' | 'reject' | null
  const [busy, setBusy] = useState(false)

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
      const bed = beds.find(b => b.id === selectedBedId)
      const name = patientName(reviewing.patient_id)
      const admissionNumber = `ADM-${Date.now().toString().slice(-8)}`

      await addAdmission({
        patient_id: reviewing.patient_id,
        admission_request_id: reviewing.id,
        admission_number: admissionNumber,
        admission_type: reviewing.admission_type,
        diagnosis: reviewing.diagnosis,
        reason: reviewing.reason,
        ward: bed?.section || reviewing.requested_ward,
        bed_id: selectedBedId,
        attending_doctor_id: reviewing.doctor_id,
        attending_doctor_name: reviewing.doctor_name,
        admitted_by: profile.id,
        admitted_at: new Date().toISOString(),
        status: 'active',
      })

      await updateBed(selectedBedId, {
        status: 'occupied',
        patient_name: name,
        doctor_name: reviewing.doctor_name,
        admission_date: new Date().toISOString().slice(0, 10),
        diagnosis: reviewing.diagnosis,
        billing_cleared: false,
        pharmacy_cleared: false,
        doctor_signed: false,
      })

      await updateRequest(reviewing.id, {
        status: 'approved',
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
      })

      showToast(`${name} admitted — ${admissionNumber}`)
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
      showToast(`Request for ${patientName(reviewing.patient_id)} rejected`)
      closeReview()
    } catch (err) {
      showToast(err.message || 'Could not reject request')
    } finally {
      setBusy(false)
    }
  }

  const availableBedOptions = beds.filter(b => b.status === 'available')

  // --- Section 8: Discharge flow ---
  const activeAdmissions = admissions
    .filter(a => a.status === 'active')
    .sort((a, b) => new Date(b.admitted_at) - new Date(a.admitted_at))

  const cleaningBeds = beds.filter(b => b.status === 'cleaning')

  const [dischargeBusyId, setDischargeBusyId] = useState(null)
  const [confirmingDischarge, setConfirmingDischarge] = useState(null) // admission being confirmed
  const [dischargeReason, setDischargeReason] = useState('')

  async function toggleChecklistItem(admission, field, value){
    const bed = bedById(admission.bed_id)
    if (!bed) return
    setDischargeBusyId(admission.id)
    try {
      await updateBed(bed.id, { [field]: value })
    } finally {
      setDischargeBusyId(null)
    }
  }

  function openConfirmDischarge(admission){
    setConfirmingDischarge(admission)
    setDischargeReason('')
  }

  function closeConfirmDischarge(){
    setConfirmingDischarge(null)
    setDischargeReason('')
  }

  async function handleDischarge(){
    if (!confirmingDischarge) return
    const admission = confirmingDischarge
    const bed = bedById(admission.bed_id)
    if (!bed || !(bed.billing_cleared && bed.pharmacy_cleared && bed.doctor_signed)) return

    setDischargeBusyId(admission.id)
    try {
      await updateAdmission(admission.id, {
        status: 'discharged',
        discharge_date: new Date().toISOString(),
        discharge_reason: dischargeReason.trim() || null,
      })
      await updateBed(bed.id, {
        status: 'cleaning',
        patient_name: null,
        doctor_name: null,
        admission_date: null,
        diagnosis: null,
        billing_cleared: false,
        pharmacy_cleared: false,
        doctor_signed: false,
      })
      showToast(`${patientName(admission.patient_id)} discharged`)
      closeConfirmDischarge()
    } catch (err) {
      showToast(err.message || 'Could not discharge patient')
    } finally {
      setDischargeBusyId(null)
    }
  }

  async function markBedReady(bed){
    setDischargeBusyId(bed.id)
    try {
      await updateBed(bed.id, { status: 'available' })
      showToast(`${bed.section} — Bed ${bed.bed_number} marked available`)
    } finally {
      setDischargeBusyId(null)
    }
  }

  return (
    <div>
      <div className="dash-panel" style={{ marginBottom: 16 }}>
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Admissions</div>
          <div className="dash-panel-sub">
              Requests, bed assignment, and active admissions
              {!canEdit && !canToggleBilling && !canTogglePharmacy && <span style={{ marginLeft: 8, opacity: .7 }}>· View only</span>}
              {!canEdit && canToggleBilling && <span style={{ marginLeft: 8, opacity: .7 }}>· Billing clearance only</span>}
              {!canEdit && canTogglePharmacy && <span style={{ marginLeft: 8, opacity: .7 }}>· Pharmacy clearance only</span>}
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
      <div className="dash-panel" style={{ marginBottom: 20 }}>
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
                <th>Requesting Doctor</th>
                <th>Ward</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Requested At</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map(r => (
                <tr key={r.id}>
                  <td>{patientName(r.patient_id)}</td>
                  <td>{r.doctor_name || '—'}</td>
                  <td>{r.requested_ward || '—'}</td>
                  <td>{ADMISSION_TYPE_LABELS[r.admission_type] || r.admission_type || '—'}</td>
                  <td>{PRIORITY_LABELS[r.priority] || r.priority || '—'}</td>
                  <td>{r.created_at ? new Date(r.created_at).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
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

      {/* Section 8: Currently admitted / discharge */}
      <div className="dash-panel" style={{ marginBottom: 20 }}>
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Currently Admitted</div>
            <div className="dash-panel-sub">All three checks are required before a patient can be discharged</div>
          </div>
        </div>

        {activeAdmissions.length === 0 ? (
          <div className="dash-empty">No patients currently admitted.</div>
        ) : (
          <table className="dash-full-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Bed</th>
                <th>Doctor</th>
                <th>Admitted</th>
                <th>Billing</th>
                <th>Pharmacy</th>
                <th>Doctor Sign-off</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activeAdmissions.map(a => {
                const bed = bedById(a.bed_id)
                const allCleared = bed && bed.billing_cleared && bed.pharmacy_cleared && bed.doctor_signed
                const rowBusy = dischargeBusyId === a.id
                return (
                  <tr key={a.id}>
                    <td>{patientName(a.patient_id)}</td>
                    <td>{bed ? `${bed.section} — Bed ${bed.bed_number}` : '—'}</td>
                    <td>{a.attending_doctor_name || '—'}</td>
                    <td>{a.admitted_at ? new Date(a.admitted_at).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' }) : '—'}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!bed?.billing_cleared}
                        disabled={!canToggleBilling || rowBusy || !bed}
                        onChange={e => toggleChecklistItem(a, 'billing_cleared', e.target.checked)}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!bed?.pharmacy_cleared}
                        disabled={!canEdit || rowBusy || !bed}
                        onChange={e => toggleChecklistItem(a, 'pharmacy_cleared', e.target.checked)}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!bed?.doctor_signed}
                        disabled={!canEdit || rowBusy || !bed}
                        onChange={e => toggleChecklistItem(a, 'doctor_signed', e.target.checked)}
                      />
                    </td>
                    <td>
                      {canEdit && (
                        <button
                          className="btn btn-ghost"
                          style={{ width: 'auto', padding: '4px 10px' }}
                          disabled={!allCleared || rowBusy}
                          onClick={() => openConfirmDischarge(a)}
                        >
                          Discharge
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Cleaning queue */}
      {cleaningBeds.length > 0 && (
        <div className="dash-panel" style={{ marginBottom: 20 }}>
          <div className="dash-panel-head">
            <div className="dash-panel-title">Beds Awaiting Cleaning</div>
          </div>
          <table className="dash-full-table">
            <thead><tr><th>Section</th><th>Bed</th><th></th></tr></thead>
            <tbody>
              {cleaningBeds.map(b => (
                <tr key={b.id}>
                  <td>{b.section}</td>
                  <td>{b.bed_number}</td>
                  <td>
                    {canEdit && (
                      <button
                        className="btn btn-ghost"
                        style={{ width: 'auto', padding: '4px 10px' }}
                        disabled={dischargeBusyId === b.id}
                        onClick={() => markBedReady(b)}
                      >
                        Mark Ready
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Section 7: Review screen */}
      {reviewing && (
        <div className="dash-modal-backdrop">
          <div className="card dash-modal">
            <div className="dash-modal-title">
              {canEdit && reviewing.status === 'pending' ? 'Review Request' : 'Request Details'}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div className="field"><label>Patient</label><div>{patientName(reviewing.patient_id)}</div></div>
              <div className="field"><label>Requesting Doctor</label><div>{reviewing.doctor_name || '—'}</div></div>
              <div className="field"><label>Admission Type</label><div>{ADMISSION_TYPE_LABELS[reviewing.admission_type] || reviewing.admission_type || '—'}</div></div>
              <div className="field"><label>Priority</label><div>{PRIORITY_LABELS[reviewing.priority] || reviewing.priority || '—'}</div></div>
              <div className="field"><label>Requested Ward</label><div>{reviewing.requested_ward || '—'}</div></div>
              <div className="field"><label>Requested Bed Type</label><div>{reviewing.requested_bed_type || '—'}</div></div>
              <div className="field"><label>Expected Length of Stay</label><div>{reviewing.expected_los || '—'}</div></div>
              <div className="field"><label>Diagnosis</label><div>{reviewing.diagnosis || '—'}</div></div>
              <div className="field"><label>Reason</label><div>{reviewing.reason || '—'}</div></div>
              {reviewing.isolation_required && (
                <div className="field"><label>Isolation</label><div>Required</div></div>
              )}
              {reviewing.special_instructions && (
                <div className="field"><label>Special Instructions</label><div>{reviewing.special_instructions}</div></div>
              )}
              {reviewing.clinical_notes && (
                <div className="field"><label>Clinical Notes</label><div>{reviewing.clinical_notes}</div></div>
              )}
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
                      <label>Assign Bed {reviewing.requested_ward ? `(requested: ${reviewing.requested_ward})` : ''}</label>
                      <select value={selectedBedId} onChange={e => setSelectedBedId(e.target.value)}>
                        <option value="">Select an available bed…</option>
                        {availableBedOptions.map(b => (
                          <option key={b.id} value={b.id}>{b.section} — Bed {b.bed_number}</option>
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

      {/* Discharge confirmation */}
      {confirmingDischarge && (
        <div className="dash-modal-backdrop">
          <div className="card dash-modal">
            <div className="dash-modal-title">Confirm Discharge</div>
            <div style={{ marginBottom: 16 }}>
              <div className="field"><label>Patient</label><div>{patientName(confirmingDischarge.patient_id)}</div></div>
              <div className="field">
                <label>Discharge Notes (optional)</label>
                <input value={dischargeReason} onChange={e => setDischargeReason(e.target.value)} placeholder="e.g. Recovered, referred, follow-up in 2 weeks…" />
              </div>
            </div>
            <div className="dash-modal-actions">
              <button className="btn btn-ghost" onClick={closeConfirmDischarge} disabled={dischargeBusyId === confirmingDischarge.id}>Cancel</button>
              <button className="btn btn-primary" onClick={handleDischarge} disabled={dischargeBusyId === confirmingDischarge.id}>
                {dischargeBusyId === confirmingDischarge.id ? 'Discharging…' : 'Confirm Discharge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="dash-toast">{toast}</div>}
    </div>
  )
}
