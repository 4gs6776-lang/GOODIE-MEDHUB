import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'

const PROVIDERS = ['NHIS', 'Hygeia HMO', 'Reliance HMO', 'AXA Mansard', 'AIICO', 'Avon HMO', 'Other']

export default function Insurance(){
  const { profile, hospital } = useAuth()
  const { records: claims, loading, isOnline, pendingCount, addRecord, deleteRecord, updateRecord } = useOfflineTable('insurance_claims', hospital?.id)
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState(null)

  const [patientName, setPatientName] = useState('')
  const [provider, setProvider] = useState(PROVIDERS[0])
  const [policyNumber, setPolicyNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function formatMoney(n){
    return '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })
  }

  async function handleAdd(e){
    e.preventDefault()
    setFormError('')
    if (!patientName || !policyNumber || !amount) {
      setFormError('Patient name, policy number, and amount are required.')
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
        provider,
        policy_number: policyNumber,
        amount: parseFloat(amount),
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        created_by: profile.id,
      })
      setShowModal(false)
      setPatientName(''); setProvider(PROVIDERS[0]); setPolicyNumber(''); setAmount('')
      showToast(isOnline ? 'Claim submitted' : 'Claim submitted — will sync when back online')
    } catch (err) {
      setFormError(err.message || 'Could not save claim')
    } finally {
      setSaving(false)
    }
  }

  async function handleApprove(claim){
    await updateRecord(claim.id, { status: 'approved' })
    showToast(isOnline ? 'Claim approved' : 'Claim approved — will sync when back online')
  }

  async function handleReject(claim){
    const reason = prompt(`Reason for rejecting claim for ${claim.patient_name}:`, claim.rejection_reason || '')
    if (reason === null) return
    await updateRecord(claim.id, { status: 'rejected', rejection_reason: reason })
    showToast(isOnline ? 'Claim rejected' : 'Claim rejected — will sync when back online')
  }

  async function handleReopen(claim){
    await updateRecord(claim.id, { status: 'submitted' })
    showToast(isOnline ? 'Marked submitted' : 'Marked submitted — will sync when back online')
  }

  async function handleDelete(claim){
    if (!confirm(`Delete this claim for ${claim.patient_name}?`)) return
    await deleteRecord(claim.id)
    showToast('Claim deleted')
  }

  function statusMeta(status){
    if (status === 'approved') return { label: 'Approved', bg: 'var(--teal-soft)', color: 'var(--teal)' }
    if (status === 'rejected') return { label: 'Rejected', bg: 'rgba(225,104,94,0.14)', color: 'var(--danger)' }
    return { label: 'Submitted', bg: 'rgba(201,169,97,0.14)', color: 'var(--gold)' }
  }

  const sorted = [...claims].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
  const submittedCount = claims.filter(c => c.status === 'submitted').length
  const approvedTotal = claims.filter(c => c.status === 'approved').reduce((sum, c) => sum + Number(c.amount), 0)
  const rejectedCount = claims.filter(c => c.status === 'rejected').length

  return (
    <>
      <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(201,169,97,0.14)', color: 'var(--gold)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Pending</div>
            <div className="dash-stat-value">{submittedCount}</div>
            <div className="dash-stat-delta" style={{ color: 'var(--gold)' }}>awaiting review</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Approved Value</div>
            <div className="dash-stat-value" style={{ fontSize: 17 }}>{formatMoney(approvedTotal)}</div>
            <div className="dash-stat-delta">{claims.filter(c => c.status === 'approved').length} claim(s)</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(225,104,94,0.14)', color: 'var(--danger)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Rejected</div>
            <div className="dash-stat-value">{rejectedCount}</div>
            <div className="dash-stat-delta">needs resubmission</div>
          </div>
        </div>
      </div>

      <div className="dash-panel">
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Insurance / HMO Claims</div>
            <div className="dash-panel-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? 'var(--teal)' : 'var(--danger)', display: 'inline-block' }} />
              {isOnline ? 'Online' : 'Offline'}{pendingCount > 0 ? ` · ${pendingCount} syncing` : ''}
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New Claim</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No claims yet. Add your first one above.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Patient', 'Provider', 'Policy No.', 'Amount', 'Status', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '0 12px 12px', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(claim => {
                const meta = statusMeta(claim.status)
                return (
                  <tr key={claim.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: 12, fontWeight: 700 }}>{claim.patient_name}</td>
                    <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5 }}>{claim.provider}</td>
                    <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5 }}>{claim.policy_number}</td>
                    <td style={{ padding: 12, fontWeight: 700 }}>{formatMoney(claim.amount)}</td>
                    <td style={{ padding: 12 }}>
                      {claim.status === 'submitted' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <span
                            onClick={() => handleApprove(claim)}
                            style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', background: 'var(--teal-soft)', color: 'var(--teal)' }}
                            title="Approve"
                          >Approve</span>
                          <span
                            onClick={() => handleReject(claim)}
                            style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', background: 'rgba(225,104,94,0.14)', color: 'var(--danger)' }}
                            title="Reject"
                          >Reject</span>
                        </div>
                      ) : (
                        <span
                          onClick={() => handleReopen(claim)}
                          style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', background: meta.bg, color: meta.color }}
                          title={claim.status === 'rejected' && claim.rejection_reason ? claim.rejection_reason : 'Tap to reopen'}
                        >
                          {meta.label}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: 12 }}>
                      <button
                        onClick={() => handleDelete(claim)}
                        style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}
                        title="Delete"
                      >✕</button>
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
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 18 }}>New Insurance Claim</div>
            {formError && <div className="error-box">{formError}</div>}
            <form onSubmit={handleAdd}>
              <div className="field">
                <label>Patient Name</label>
                <input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="e.g. Chinedu Okafor" />
              </div>
              <div className="field">
                <label>Provider / HMO</label>
                <select value={provider} onChange={e => setProvider(e.target.value)}>
                  {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Policy Number</label>
                <input value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} placeholder="e.g. NHIS-2024-00123" />
              </div>
              <div className="field">
                <label>Claim Amount</label>
                <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Submit Claim'}</button>
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
