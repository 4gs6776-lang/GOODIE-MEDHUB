import AppIcon from '../icons'

// =====================================================================
// GOODIE-MEDHUB — UrgencyBanner
//
// Shows the urgency level of an AI assessment at the top of the report.
//
// CRITICAL: red background, "Critical — escalate immediately" text +
//   an icon + a clear instruction. Always paired with text, never
//   color alone (accessibility — color-blind users must still see
//   the urgency).
//
// URGENT: gold background, "Urgent — prompt clinician review" text.
//
// ROUTINE: teal background, "Routine assessment" text.
//
// If `escalate_immediately` is true, ALWAYS renders as critical even
// if `level` was set to something else (defensive — the AI's
// escalate_immediately flag is the source of truth, not the level
// enum).
// =====================================================================

const URGENCY_CONFIG = {
  critical: {
    bg: 'rgba(240,79,95,0.14)',
    border: 'rgba(240,79,95,0.4)',
    color: 'var(--danger)',
    label: 'CRITICAL',
    description: 'Immediate escalation required',
    icon: 'alert',
  },
  urgent: {
    bg: 'rgba(232,184,46,0.14)',
    border: 'rgba(232,184,46,0.4)',
    color: 'var(--gold)',
    label: 'URGENT',
    description: 'Prompt clinician review needed',
    icon: 'clock',
  },
  routine: {
    bg: 'rgba(0,199,199,0.10)',
    border: 'rgba(0,199,199,0.25)',
    color: 'var(--teal)',
    label: 'ROUTINE',
    description: 'No immediate escalation required',
    icon: 'check',
  },
}

export default function UrgencyBanner({ urgency }) {
  if (!urgency) {
    return (
      <div style={{
        padding: '12px 16px', borderRadius: 10,
        background: 'var(--bg-elevated)', border: '1px solid var(--line)',
        color: 'var(--muted)', fontSize: 13,
      }}>
        Urgency assessment unavailable.
      </div>
    )
  }

  // Defensive: escalate_immediately wins over whatever the level says.
  const effectiveLevel = urgency.escalate_immediately
    ? 'critical'
    : (urgency.level || 'routine')

  const cfg = URGENCY_CONFIG[effectiveLevel] || URGENCY_CONFIG.routine

  return (
    <div
      role="alert"
      aria-live={effectiveLevel === 'critical' ? 'assertive' : 'polite'}
      aria-label={`${cfg.label}: ${cfg.description}`}
      style={{
        padding: '14px 16px',
        borderRadius: 10,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 16,
      }}
    >
      {/* Icon — never color-only. Uses the unified AppIcon system. */}
      <div
        style={{
          width: 32, height: 32, minWidth: 32, borderRadius: 8,
          background: cfg.bg, color: cfg.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        aria-hidden="true"
      >
        <AppIcon name={cfg.icon} size={18} strokeWidth={2.2} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          flexWrap: 'wrap', marginBottom: 4,
        }}>
          <span style={{
            fontSize: 12, fontWeight: 800, letterSpacing: 1.2,
            color: cfg.color, textTransform: 'uppercase',
          }}>
            {cfg.label}
          </span>
          <span style={{ fontSize: 13, color: 'var(--ivory)', fontWeight: 600 }}>
            {cfg.description}
          </span>
        </div>

        {urgency.reasoning && (
          <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
            {urgency.reasoning}
          </div>
        )}

        {/* Red flags list (if any) */}
        {Array.isArray(urgency.red_flags) && urgency.red_flags.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: 1,
              color: cfg.color, textTransform: 'uppercase', marginBottom: 6,
            }}>
              Red flags detected
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ivory)', fontSize: 12.5 }}>
              {urgency.red_flags.map((rf, i) => (
                <li key={i} style={{ marginBottom: 4, lineHeight: 1.5 }}>
                  <strong>{rf.finding}</strong>
                  {rf.source && (
                    <span style={{ color: 'var(--muted)', marginLeft: 8, fontSize: 11 }}>
                      (source: {rf.source})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Critical-escalation instruction */}
        {effectiveLevel === 'critical' && (
          <div style={{
            marginTop: 12, padding: '10px 12px', borderRadius: 8,
            background: 'rgba(240,79,95,0.08)', border: '1px solid rgba(240,79,95,0.25)',
            fontSize: 12.5, color: 'var(--ivory)', lineHeight: 1.5,
          }}>
            <strong style={{ color: 'var(--danger)' }}>Action required:</strong>{' '}
            Escalate to the senior clinician on call per your hospital's protocol.
            Do not delay escalation to await further AI analysis.
          </div>
        )}
      </div>
    </div>
  )
}
