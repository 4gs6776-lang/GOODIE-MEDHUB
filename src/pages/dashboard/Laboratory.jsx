import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'

export default function Laboratory(){
  const { profile, hospital } = useAuth()
  const { records: tests, loading, isOnline, pendingCount, addRecord, deleteRecord, updateRecord } = useOfflineTable('lab_tests', hospital?.id)
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState(null)

  const [patientName, setPatientName] = useState('')
  const [testName, setTestName] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleAdd(e){
    e.preventDefault()
    setFormError('')
    if (!patientName || !testName) {
      setFormError('Patient name and test name are required.')
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
        test_name: testName,
        status: 'pending',
        result: null,
        requested_at: new Date().toISOString(),
        created_by: profile.id,
      })
      setShowModal(false)
      setPatientName(''); setTestName('')
      showToast(isOnline ? 'Test requested' : 'Test requested — will sync when back online')
    } catch (err) {
      setFormError(err.message || 'Could not save test request')
    } finally {
      setSaving(false)
    }
  }

  async function handleComplete(test){
    const result = prompt(`Enter result for ${test.test_name} (${test.patient_name}):`, test.result || '')
    if (result === null) return
    await updateRecord(test.id, { status: 'completed', result })
    showToast(isOnline ? 'Marked completed' : 'Marked completed — will sync when back online')
  }

  async function handleReopen(test){
    await updateRecord(test.id, { status: 'pending' })
    showToast(isOnline ? 'Marked pending' : 'Marked pending — will sync when back online')
  }

  async function handleDelete(test){
    if (!confirm(`Delete this test request for ${test.patient_name}?`)) return
    await deleteRecord(test.id)
    showToast('Test deleted')
  }

  const sorted = [...tests].sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at))
  const pendingCountStat = tests.filter(t => t.status === 'pending').length
  const completedCount = tests.filter(t => t.status === 'completed').length

  return (
    <>
      <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 20 }}>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(201,169,97,0.14)', color: 'var(--gold)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Pending</div>
            <div className="dash-stat-value">{pendingCountStat}</div>
            <div className="dash-stat-delta" style={{ color: 'var(--gold)' }}>awaiting results</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 6 9 17l-5-5"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Completed</div>
            <div className="dash-stat-value">{completedCount}</div>
            <div className="dash-stat-delta">results ready</div>
          </div>
        </div>
      </div>

      <div className="dash-panel">
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Lab Requests</div>
            <div className="dash-panel-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? 'var(--teal)' : 'var(--danger)', display: 'inline-block' }} />
              {isOnline ? 'Online' : 'Offline'}{pendingCount > 0 ? ` · ${pendingCount} syncing` : ''}
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New Request</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No lab requests yet. Add your first one above.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Patient', 'Test', 'Status', 'Result', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '0 12px 12px', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(test => (
                <tr key={test.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                  <td style={{ padding: 12, fontWeight: 700 }}>{test.patient_name}</td>
                  <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5 }}>{test.test_name}</td>
                  <td style={{ padding: 12 }}>
                    <span
                      onClick={() => test.status === 'pending' ? handleComplete(test) : handleReopen(test)}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                        background: test.status === 'completed' ? 'var(--teal-soft)' : 'rgba(201,169,97,0.14)',
                        color: test.status === 'completed' ? 'var(--teal)' : 'var(--gold)',
                      }}
                      title="Tap to change"
                    >
                      {test.status === 'completed' ? 'Completed' : 'Pending'}
                    </span>
                  </td>
                  <td style={{ padding: 12, fontSize: 12, color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {test.result || '—'}
                  </td>
                  <td style={{ padding: 12 }}>
                    <button
                      onClick={() => handleDelete(test)}
                      style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}
                      title="Delete"
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 18 }}>New Lab Request</div>
            {formError && <div className="error-box">{formError}</div>}
            <form onSubmit={handleAdd}>
              <div className="field">
                <label>Patient Name</label>
                <input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="e.g. Chinedu Okafor" />
              </div>
              <div className="field">
                <label>Test Name</label>
                <input value={testName} onChange={e => setTestName(e.target.value)} placeholder="e.g. Full Blood Count" />
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
