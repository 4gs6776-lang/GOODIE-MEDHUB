import { useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOfflineTable } from '../lib/useOfflineTable'
import AppIcon from './icons'
import {
  APPROVAL_REQUEST_TYPES,
  APPROVAL_STATUSES,
  approveApprovalRequest,
  rejectApprovalRequest,
  formatMoney,
} from '../lib/billingService'

// =====================================================================
// <ApprovalQueueModal> — admin/owner view of pending approvals.
//
// Lists all pending approval_requests for this hospital. Admin can
// approve or reject each one (rejection requires a reason).
//
// Usage:
//   <ApprovalQueueModal onClose={() => setShowApprovals(false)} />
// =====================================================================

export default function ApprovalQueueModal({ onClose }) {
  const { profile, hospital } = useAuth()
  const { records: approvals, updateRecord: updateApproval } = useOfflineTable('approval_requests', hospital?.id)
  const [filter, setFilter] = useState('pending')  // 'pending' | 'all' | 'approved' | 'rejected'
  const [selectedApproval, setSelectedApproval] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [approveReason, setApproveReason] = useState('')
  const [actioning, setActioning] = useState(false)

  const filtered = useMemo(() => {
    let arr = [...(approvals || [])]
    if (filter !== 'all') arr = arr.filter(a => a.status === filter)
    return arr.sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at))
  }, [approvals, filter])

  const pendingCount = (approvals || []).filter(a => a.status === 'pending').length

  const typeLabel = (t) => APPROVAL_REQUEST_TYPES.find(x => x.value === t)?.label || t
  const statusMeta = (s) => APPROVAL_STATUSES.find(x => x.value === s) || { label: s, color: 'var(--muted)' }

  async function handleApprove(approval) {
    setActioning(true)
    const result = await approveApprovalRequest({
      hospital, profile,
      approval,
      approvalReason: approveReason.trim() || null,
      updateApproval,
      writeAudit: null, // billingService calls writeAudit if provided — but we don't have it here
    })
    if (result.success) {
      setSelectedApproval(null)
      setApproveReason('')
    } else {
      alert(result.error || 'Could not approve')
    }
    setActioning(false)
  }

  async function handleReject(approval) {
    if (!rejectReason.trim()) {
      alert('Rejection reason is required')
      return
    }
    setActioning(true)
    const result = await rejectApprovalRequest({
      hospital, profile,
      approval,
      rejectionReason: rejectReason,
      updateApproval,
      writeAudit: null,
    })
    if (result.success) {
      setSelectedApproval(null)
      setRejectReason('')
    } else {
      alert(result.error || 'Could not reject')
    }
    setActioning(false)
  }

  return (
    <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card dash-modal" style={{ maxWidth: 800, maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, flexShrink: 0 }}>
          <div>
            <div className="dash-modal-title" style={{ paddingBottom: 0 }}>
              Approval Queue
              {pendingCount > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--gold)' }}>({pendingCount} pending)</span>}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
              Approve or reject pending requests for discounts, write-offs, refunds, credit notes, and expenses.
            </div>
          </div>
          <button className="dash-icon-btn" onClick={onClose} aria-label="Close"><AppIcon name="close" size={18} /></button>
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {['pending', 'approved', 'rejected', 'all'].map(f => (
            <button
              key={f}
              type="button"
              className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
              style={{ width: 'auto', padding: '6px 12px', fontSize: 11.5, textTransform: 'capitalize' }}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : `${f.charAt(0).toUpperCase()}${f.slice(1)}`}
            </button>
          ))}
        </div>

        <div className="dash-modal-body" style={{ overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 12.5 }}>
              {filter === 'pending' ? 'No pending approvals — you\'re all caught up.' : `No ${filter} approvals.`}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(a => {
                const meta = statusMeta(a.status)
                const bgMap = {
                  'var(--gold)': 'rgba(201,169,97,0.14)',
                  'var(--teal)': 'rgba(0,199,199,0.14)',
                  'var(--danger)': 'rgba(225,104,94,0.14)',
                  'var(--muted)': 'rgba(154,170,183,0.14)',
                }
                return (
                  <div key={a.id} style={{
                    padding: 12, borderRadius: 8,
                    background: 'var(--bg-elevated)',
                    border: `1px solid ${a.status === 'pending' ? 'var(--gold)' : 'var(--line-soft)'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                      <div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(118,87,232,0.14)', color: 'var(--violet)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {typeLabel(a.request_type)}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', color: 'var(--teal)' }}>
                            {formatMoney(a.amount)}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: bgMap[meta.color] || 'rgba(154,170,183,0.14)', color: meta.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {meta.label}
                          </span>
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--ivory)', marginTop: 6 }}>{a.reason}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                          Requested by <strong>{a.requested_by_name || '—'}</strong> · {new Date(a.requested_at).toLocaleString('en-NG')} · {a.entity_type}{a.entity_id ? ` · ${a.entity_id.slice(0, 8)}…` : ''}
                        </div>
                      </div>
                      {a.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ width: 'auto', padding: '5px 12px', fontSize: 11 }}
                            disabled={actioning}
                            onClick={() => { setSelectedApproval(a); setApproveReason(''); setRejectReason('') }}
                          >
                            Review
                          </button>
                        </div>
                      )}
                    </div>

                    {selectedApproval?.id === a.id && (
                      <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--line)' }}>
                        {a.payload && Object.keys(a.payload).length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Payload</div>
                            <pre style={{ margin: 0, padding: '8px 10px', borderRadius: 4, background: 'var(--bg-elevated)', fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 120, overflowY: 'auto' }}>
                              {JSON.stringify(a.payload, null, 2)}
                            </pre>
                          </div>
                        )}
                        <input
                          value={approveReason}
                          onChange={e => setApproveReason(e.target.value)}
                          placeholder="Approval note (optional) — e.g. 'Approved per policy'"
                          style={{ width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)', marginBottom: 8 }}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ width: 'auto', padding: '6px 14px', fontSize: 11.5 }}
                            disabled={actioning}
                            onClick={() => handleApprove(a)}
                          >
                            {actioning ? 'Approving…' : '✓ Approve'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ width: 'auto', padding: '6px 14px', fontSize: 11.5, color: 'var(--danger)', borderColor: 'var(--danger)' }}
                            disabled={actioning}
                            onClick={() => handleReject(a)}
                          >
                            ✗ Reject
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ width: 'auto', padding: '6px 10px', fontSize: 11 }}
                            onClick={() => { setSelectedApproval(null); setApproveReason(''); setRejectReason('') }}
                          >
                            Cancel
                          </button>
                        </div>
                        {!rejectReason && selectedApproval && (
                          <input
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="If rejecting — enter reason here (required)"
                            style={{ width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--danger)', background: 'var(--bg-elevated)', color: 'var(--ivory)', marginTop: 8 }}
                          />
                        )}
                      </div>
                    )}

                    {a.status !== 'pending' && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, fontStyle: 'italic' }}>
                        {a.status === 'approved' ? `Approved by ${a.approver_name || '—'}` : `Rejected by ${a.approver_name || '—'}`}
                        {a.approval_reason && ` — ${a.approval_reason}`}
                        {a.rejection_reason && ` — ${a.rejection_reason}`}
                        {a.approved_at && ` · ${new Date(a.approved_at).toLocaleString('en-NG')}`}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="dash-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
