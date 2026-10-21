import { useState } from 'react'
import AppIcon from '../icons'
import { submitReview } from '../../lib/aiAssist'

// =====================================================================
// GOODIE-MEDHUB — ClinicianReviewPanel
//
// Lets the clinician record their review decision on an AI assessment:
//   - Accept  — the assessment was useful and accepted as-is
//   - Modify  — the assessment was useful but required modification
//   - Reject  — the assessment was not useful or was misleading
//
// Plus an optional free-text "review notes" field.
//
// SECURITY: only doctors / admins / owners can submit reviews. Nurses
// can request triage assessments but cannot sign off on them — that
// is enforced by submitReview() in src/lib/aiAssist.js, which checks
// the profile.role before calling supabase.from('ai_assessments').update().
//
// This panel renders for nurses too (so they can see what the doctor
// needs to do), but the buttons are disabled with an explanation.
// =====================================================================

export default function ClinicianReviewPanel({ assessment, profile, hospitalId, onReviewed }) {
  const [status, setStatus] = useState(assessment?.review_status || null)
  const [notes, setNotes] = useState(assessment?.review_notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Reviewer roles — only doctors/admins/owners can actually submit
  const reviewerRoles = ['doctor', 'admin', 'owner']
  const canReview = profile && reviewerRoles.includes(profile.role)

  if (!assessment) return null

  async function handleSubmit(reviewStatus) {
    if (!canReview) return
    setSaving(true)
    setError(null)

    const result = await submitReview({
      assessmentId: assessment.id,
      reviewStatus,
      reviewNotes: notes.trim() || null,
      profile,
    })

    setSaving(false)

    if (!result.success) {
      setError(result.error || 'Could not submit review.')
      return
    }

    setStatus(reviewStatus)
    onReviewed?.(result.assessment)
  }

  const statusConfig = {
    accepted: { label: 'Accepted', color: 'var(--teal)', bg: 'rgba(0,199,199,0.14)' },
    modified: { label: 'Modified', color: 'var(--gold)', bg: 'rgba(232,184,46,0.14)' },
    rejected: { label: 'Rejected', color: 'var(--danger)', bg: 'rgba(240,79,95,0.14)' },
  }

  return (
    <div style={{
      padding: 14, borderRadius: 10, marginBottom: 12,
      background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: 1,
        color: 'var(--teal)', textTransform: 'uppercase', marginBottom: 10,
      }}>
        Clinician Review
      </div>

      {/* If already reviewed, show the existing review */}
      {status && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 10,
          background: statusConfig[status]?.bg || 'var(--bg-card)',
          border: `1px solid ${statusConfig[status]?.color || 'var(--line)'}44`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <AppIcon
            name={status === 'accepted' ? 'check' : status === 'modified' ? 'edit' : 'close'}
            size={16}
            style={{ color: statusConfig[status]?.color }}
          />
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 12.5, fontWeight: 700,
              color: statusConfig[status]?.color,
            }}>
              {statusConfig[status]?.label}
            </div>
            {assessment.reviewed_by_name && (
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                by {assessment.reviewed_by_name}
                {assessment.reviewed_at ? ` · ${new Date(assessment.reviewed_at).toLocaleString('en-NG')}` : ''}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reviewer role check */}
      {!canReview && (
        <div style={{
          padding: '10px 12px', borderRadius: 8, marginBottom: 10,
          background: 'rgba(232,184,46,0.08)', border: '1px solid rgba(232,184,46,0.25)',
          fontSize: 12, color: 'var(--gold)', lineHeight: 1.5,
        }}>
          Your role ({profile?.role}) can request assessments but cannot sign off on them.
          A doctor, admin, or owner must submit the clinician review.
        </div>
      )}

      {/* Review notes textarea */}
      <div style={{ marginBottom: 10 }}>
        <label style={{
          display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8,
          color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 5,
        }}>
          Review notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          disabled={!canReview || saving}
          placeholder={status ? 'Update your review notes…' : 'Add notes about this assessment (e.g. "Diagnosis confirmed after physical exam", "Differential list incomplete — patient has atypical presentation")'}
          style={{
            width: '100%', minHeight: 70, padding: 10, borderRadius: 8,
            background: 'var(--bg-card)', border: '1px solid var(--line)',
            color: 'var(--ivory)', fontSize: 12.5, fontFamily: 'inherit',
            lineHeight: 1.5, resize: 'vertical', outline: 'none',
            opacity: (!canReview || saving) ? 0.6 : 1,
          }}
        />
      </div>

      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 10,
          background: 'rgba(240,79,95,0.10)', border: '1px solid rgba(240,79,95,0.3)',
          color: 'var(--danger)', fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{
            width: 'auto', padding: '8px 16px', fontSize: 12,
            background: 'var(--teal)', color: '#00251F',
          }}
          onClick={() => handleSubmit('accepted')}
          disabled={!canReview || saving}
        >
          <AppIcon name="check" size={14} />
          Accept
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{
            width: 'auto', padding: '8px 16px', fontSize: 12,
            borderColor: 'var(--gold)', color: 'var(--gold)',
          }}
          onClick={() => handleSubmit('modified')}
          disabled={!canReview || saving}
        >
          <AppIcon name="edit" size={14} />
          Modified
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{
            width: 'auto', padding: '8px 16px', fontSize: 12,
            borderColor: 'var(--danger)', color: 'var(--danger)',
          }}
          onClick={() => handleSubmit('rejected')}
          disabled={!canReview || saving}
        >
          <AppIcon name="close" size={14} />
          Reject
        </button>
      </div>

      {/* Loading indicator while saving */}
      {saving && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <AppIcon name="loading" size={12} spin />
          Saving review…
        </div>
      )}

      {/* Disclosure footer */}
      <div style={{
        marginTop: 12, padding: '8px 10px', borderRadius: 6,
        background: 'rgba(154,170,183,0.06)', border: '1px solid var(--line-soft)',
        fontSize: 11, color: 'var(--muted)', lineHeight: 1.5,
      }}>
        Reviewing an assessment records your decision in the audit trail. It does not
        automatically change the patient's record — any clinical action still requires
        explicit save in the Doctor Workbench.
      </div>
    </div>
  )
}
