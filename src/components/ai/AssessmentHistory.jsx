import AppIcon from '../icons'

// =====================================================================
// GOODIE-MEDHUB — AssessmentHistory
//
// A standalone list component showing prior AI assessments for a
// patient. Clicking a row selects that assessment (renders it in the
// main view).
//
// This is the same list that's embedded in AiDiagnostics.jsx — but
// extracted as its own component so it can be reused elsewhere (e.g.
// a future "all AI assessments across the hospital" report page).
//
// Respects the 90-day retention window — older rows simply don't
// come back from the database (enforced by RLS).
// =====================================================================

export default function AssessmentHistory({ history, loading, selectedId, onSelect, emptyText }) {
  if (loading) {
    return (
      <div style={{ padding: 14, color: 'var(--muted)', fontSize: 13, textAlign: 'center' }}>
        <AppIcon name="loading" size={14} spin /> Loading history…
      </div>
    )
  }

  if (!history || history.length === 0) {
    return (
      <div style={{
        padding: 18, textAlign: 'center', color: 'var(--muted)', fontSize: 13,
        background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--line)',
      }}>
        {emptyText || 'No prior assessments (within the 90-day retention window).'}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {history.map(h => (
        <AssessmentHistoryRow
          key={h.id}
          assessment={h}
          selected={selectedId === h.id}
          onSelect={() => onSelect(h)}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------

function AssessmentHistoryRow({ assessment, selected, onSelect }) {
  const statusColors = {
    completed: 'var(--teal)',
    insufficient_info: 'var(--gold)',
    out_of_scope: 'var(--gold)',
    failed: 'var(--danger)',
  }
  const reviewColors = {
    accepted: 'var(--teal)',
    modified: 'var(--gold)',
    rejected: 'var(--danger)',
  }

  return (
    <div
      onClick={onSelect}
      style={{
        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
        background: selected ? 'rgba(0,199,199,0.10)' : 'var(--bg-elevated)',
        border: `1px solid ${selected ? 'var(--teal-border)' : 'var(--line-soft)'}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 10, transition: 'background 0.15s',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 12.5, fontWeight: 700, color: 'var(--ivory)',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{
            fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
            background: `${statusColors[assessment.status] || 'var(--muted)'}22`,
            color: statusColors[assessment.status] || 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            {assessment.status || 'unknown'}
          </span>
          <span>{assessment.assessment_type}</span>
          {assessment.review_status && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
              background: `${reviewColors[assessment.review_status] || 'var(--muted)'}22`,
              color: reviewColors[assessment.review_status] || 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              {assessment.review_status}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
          {assessment.requested_at ? new Date(assessment.requested_at).toLocaleString('en-NG') : '—'}
          {assessment.requested_by_name && ` · ${assessment.requested_by_name}`}
          {assessment.provider && ` · ${assessment.provider}`}
        </div>
        {/* Show urgency level if available */}
        {assessment.structured_output?.urgency?.level && (
          <div style={{ fontSize: 10.5, marginTop: 3 }}>
            <span style={{
              color: assessment.structured_output.urgency.escalate_immediately ? 'var(--danger)' :
                     assessment.structured_output.urgency.level === 'urgent' ? 'var(--gold)' :
                     assessment.structured_output.urgency.level === 'critical' ? 'var(--danger)' :
                     'var(--teal)',
              fontWeight: 700,
            }}>
              {assessment.structured_output.urgency.escalate_immediately ? '⚠ CRITICAL' :
               assessment.structured_output.urgency.level.toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <AppIcon name="chevron" size={15} style={{ color: 'var(--muted)' }} />
    </div>
  )
}
