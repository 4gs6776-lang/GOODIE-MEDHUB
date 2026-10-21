import { useState } from 'react'
import AppIcon from '../icons'
import { writeAudit } from '../../lib/audit'

// =====================================================================
// GOODIE-MEDHUB — DocumentationDraft
//
// An editable text area showing the AI's draft clinical note.
// The clinician can edit the text, then click "Copy to consultation"
// to copy the current text into the Doctor Workbench form fields.
//
// IMPORTANT: this component NEVER writes to the patient record.
// Copy is a one-way push into the Doctor Workbench's local form
// state. The clinician must still click "Save" / "Complete
// Consultation" on the Doctor Workbench for the note to be saved.
// =====================================================================

export default function DocumentationDraft({ draft, assessmentId, hospitalId, profile, onCopied }) {
  const [text, setText] = useState(draft || '')
  const [copied, setCopied] = useState(false)

  // If the parent passes a new draft (different assessment), reset
  // the local state. This is rare — usually the parent unmounts and
  // remounts this component when switching assessments.
  // (Note: useEffect-based sync would be cleaner, but for a simple
  // component this is fine — the parent typically uses `key={assessmentId}`
  // to force a remount instead.)

  function handleCopy() {
    if (!text) return

    // Audit: the copy action is recorded so we can see which
    // assessments actually influenced the consultation.
    writeAudit({
      hospitalId, actor: profile,
      action: 'ai.copied_to_consultation',
      entityType: 'ai_assessment', entityId: assessmentId,
      summary: `AI documentation draft copied to consultation (${text.length} chars)`,
      metadata: {
        assessment_id: assessmentId,
        draft_length: text.length,
        was_modified: text !== draft,
      },
    })

    // Push to clipboard as a fallback. The actual "paste into form"
    // happens via onCopied callback — the parent (AiDiagnostics)
    // can choose what to do with it (e.g. close the overlay and
    // pre-fill the Doctor Workbench).
    try {
      navigator.clipboard?.writeText(text)
    } catch {
      // Clipboard may not be available (e.g. insecure context). The
      // onCopied callback is the primary mechanism.
    }

    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    onCopied?.(text)
  }

  function handleReset() {
    setText(draft || '')
  }

  if (!draft) {
    return (
      <div style={{
        padding: 14, borderRadius: 10, marginBottom: 12,
        background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 1,
          color: 'var(--teal)', textTransform: 'uppercase', marginBottom: 8,
        }}>
          Documentation Draft
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' }}>
          The AI did not produce a documentation draft for this assessment.
        </div>
      </div>
    )
  }

  const wasModified = text !== draft

  return (
    <div style={{
      padding: 14, borderRadius: 10, marginBottom: 12,
      background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 10, flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 1,
          color: 'var(--teal)', textTransform: 'uppercase',
        }}>
          Documentation Draft
        </div>
        {wasModified && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
            background: 'rgba(232,184,46,0.14)', color: 'var(--gold)',
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            Modified
          </span>
        )}
      </div>

      <div style={{
        fontSize: 10.5, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5,
        padding: '8px 10px', borderRadius: 6,
        background: 'rgba(232,184,46,0.06)', border: '1px solid rgba(232,184,46,0.2)',
      }}>
        <strong style={{ color: 'var(--gold)' }}>Review required:</strong>{' '}
        This is an AI-generated draft. Edit it as needed, then click "Copy to consultation"
        to paste into the Doctor Workbench. You must still save the consultation
        in the Doctor Workbench for the note to become part of the official record.
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        style={{
          width: '100%', minHeight: 180, padding: 12, borderRadius: 8,
          background: 'var(--bg-card)', border: '1px solid var(--line)',
          color: 'var(--ivory)', fontSize: 12.5, fontFamily: 'inherit',
          lineHeight: 1.6, resize: 'vertical',
          outline: 'none',
        }}
      />

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 10, flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          {text.length} characters
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {wasModified && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: 'auto', padding: '7px 14px', fontSize: 12 }}
              onClick={handleReset}
            >
              Reset to AI draft
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: 'auto', padding: '7px 16px', fontSize: 12 }}
            onClick={handleCopy}
            disabled={!text.trim()}
          >
            {copied ? (
              <><AppIcon name="check" size={14} /> Copied!</>
            ) : (
              <><AppIcon name="clipboard" size={14} /> Copy to consultation</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
