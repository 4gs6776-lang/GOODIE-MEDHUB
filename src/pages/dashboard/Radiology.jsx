import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import SearchInput from '../../components/common/SearchInput'
import TrashIcon from '../../components/icons/TrashIcon'

const MODALITIES = ['X-Ray', 'CT Scan', 'MRI', 'Ultrasound', 'Mammography', 'Fluoroscopy']

export default function Radiology(){
  const { profile, hospital } = useAuth()
  const { records: scans, loading, isOnline, pendingCount, addRecord, deleteRecord, updateRecord } = useOfflineTable('radiology_scans', hospital?.id)
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const [patientName, setPatientName] = useState('')
  const [modality, setModality] = useState(MODALITIES[0])
  const [bodyPart, setBodyPart] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleAdd(e){
    e.preventDefault()
    setFormError('')
    if (!patientName || !bodyPart) {
      setFormError('Patient name and body part / area are required.')
      return
    }
    if (!hospital || !profile) {
      setFormError('Still loading your account — try again in a moment.')
      return
    }
    setSaving(true)
    try {
      await addRecord({
        patient_name: patientName,
        modality,
        body_part: bodyPart,
        status: 'requested',
        report: null,
        requested_at: new Date().toISOString(),
        created_by: profile.id,
      })
      setShowModal(false)
      setPatientName(''); setModality(MODALITIES[0]); setBodyPart('')
      showToast(isOnline ? 'Scan requested' : 'Scan requested — will sync when back online')
    } catch (err) {
      setFormError(err.message || 'Could not save scan request')
    } finally {
      setSaving(false)
    }
  }

  async function handleStart(scan){
    await updateRecord(scan.id, { status: 'in_progress' })
    showToast(isOnline ? 'Marked in progress' : 'Marked in progress — will sync when back online')
  }

  async function handleComplete(scan){
    const report = prompt(`Enter findings / report for ${scan.modality} — ${scan.body_part} (${scan.patient_name}):`, scan.report || '')
    if (report === null) return
    await updateRecord(scan.id, { status: 'completed', report })
    showToast(isOnline ? 'Marked completed' : 'Marked completed — will sync when back online')
  }

  async function handleReopen(scan){
    await updateRecord(scan.id, { status: 'requested' })
    showToast(isOnline ? 'Marked requested' : 'Marked requested — will sync when back online')
  }

  async function handleDelete(scan){
    if (!confirm(`Delete this scan request for ${scan.patient_name}?`)) return
    await deleteRecord(scan.id)
    showToast('Scan deleted')
  }

  function statusMeta(status){
    if (status === 'completed') return { label: 'Completed', bg: 'var(--teal-soft)', color: 'var(--teal)' }
    if (status === 'in_progress') return { label: 'In Progress', bg: 'rgba(139,124,246,0.14)', color: 'var(--violet)' }
    return { label: 'Requested', bg: 'rgba(201,169,97,0.14)', color: 'var(--gold)' }
  }

  function nextAction(scan){
    if (scan.status === 'requested') return () => handleStart(scan)
    if (scan.status === 'in_progress') return () => handleComplete(scan)
    return () => handleReopen(scan)
  }

  const sorted = [...scans].sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at))
  const radiologySearch = searchTerm.trim().toLowerCase()
  const visibleSorted = radiologySearch ? sorted.filter(s => [s.patient_name, s.patient_id, s.modality, s.body_area, s.request_number, s.status, s.report].some(v => String(v || '').toLowerCase().includes(radiologySearch))) : sorted
  const requestedCount = scans.filter(s => s.status === 'requested').length
  const inProgressCount = scans.filter(s => s.status === 'in_progress').length
  const completedCount = scans.filter(s => s.status === 'completed').length

  return (
    <>
      <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(201,169,97,0.14)', color: 'var(--gold)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Requested</div>
            <div className="dash-stat-value">{requestedCount}</div>
            <div className="dash-stat-delta" style={{ color: 'var(--gold)' }}>awaiting imaging</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(139,124,246,0.14)', color: 'var(--violet)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M12 13v5M9.5 15.5h5"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">In Progress</div>
            <div className="dash-stat-value">{inProgressCount}</div>
            <div className="dash-stat-delta" style={{ color: 'var(--violet)' }}>being scanned</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 6 9 17l-5-5"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Completed</div>
            <div className="dash-stat-value">{completedCount}</div>
            <div className="dash-stat-delta">reports ready</div>
          </div>
        </div>
      </div>

      <div className="dash-panel">
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Imaging Requests</div>
            <div className="dash-panel-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? 'var(--teal)' : 'var(--danger)', display: 'inline-block' }} />
              {isOnline ? 'Online' : 'Offline'}{pendingCount > 0 ? ` · ${pendingCount} syncing` : ''}
            </div>
          </div>
          <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search patient, scan or request number" style={{ minWidth: 260, maxWidth: 420 }} />
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New Scan Request</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
        ) : visibleSorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No scan requests yet. Add your first one above.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Patient', 'Modality', 'Area', 'Status', 'Report', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '0 12px 12px', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleSorted.map(scan => {
                const meta = statusMeta(scan.status)
                return (
                  <tr key={scan.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: 12, fontWeight: 700 }}>{scan.patient_name}</td>
                    <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5 }}>{scan.modality}</td>
                    <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5 }}>{scan.body_part}</td>
                    <td style={{ padding: 12 }}>
                      <span
                        onClick={nextAction(scan)}
                        style={{
                          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                          background: meta.bg, color: meta.color,
                        }}
                        title="Tap to change"
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td style={{ padding: 12, fontSize: 12, color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {scan.report || '—'}
                    </td>
                    <td style={{ padding: 12 }}>
                      <button
                        onClick={() => handleDelete(scan)}
                        className="icon-btn-delete"
                        title="Delete"
                      ><TrashIcon size={14}/></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 18 }}>New Scan Request</div>
            {formError && <div className="error-box">{formError}</div>}
            <form onSubmit={handleAdd}>
              <div className="field">
                <label>Patient Name</label>
                <input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="e.g. Chinedu Okafor" />
              </div>
              <div className="field">
                <label>Modality</label>
                <select value={modality} onChange={e => setModality(e.target.value)}>
                  {MODALITIES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Body Part / Area</label>
                <input value={bodyPart} onChange={e => setBodyPart(e.target.value)} placeholder="e.g. Chest, Left Knee" />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Request'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)',
          padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 60, maxWidth: '85vw', textAlign: 'center',
        }}>
          {toast}
        </div>
      )}
    </>
  )
}
