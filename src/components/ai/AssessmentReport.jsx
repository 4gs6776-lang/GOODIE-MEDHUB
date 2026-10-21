import UrgencyBanner from './UrgencyBanner'

// =====================================================================
// GOODIE-MEDHUB — AssessmentReport
//
// Renders the structured AI assessment output (from
// ai_assessments.structured_output) as proper styled components.
// Replaces the JSON preview that was in AiDiagnostics.jsx during
// Batch 4.
//
// The AI's response schema (defined in the edge function, Batch 3)
// has these fields:
//   - status
//   - clinical_summary
//   - urgency                     ← rendered by UrgencyBanner
//   - differential_diagnoses
//   - recommended_next_steps
//   - investigation_interpretation
//   - medication_safety_review
//   - missing_information
//   - clinical_uncertainty
//   - evidence_and_references
//   - documentation_draft         ← rendered by DocumentationDraft
//   - self_reported_limitations
//
// Every section is defensive: if the AI returned an empty array or
// null for a section, we show a small "no items" hint rather than
// rendering an empty box. This makes it obvious when the AI had
// nothing to say vs. when rendering failed.
// =====================================================================

export default function AssessmentReport({ assessment, onCopyToConsultation }) {
  if (!assessment) return null

  const out = assessment.structured_output || {}

  // If the AI call itself failed, show a clean failure state.
  if (assessment.status === 'failed') {
    return (
      <div style={{
        padding: 16, borderRadius: 10,
        background: 'rgba(240,79,95,0.08)', border: '1px solid rgba(240,79,95,0.3)',
        color: 'var(--ivory)', fontSize: 13, lineHeight: 1.5,
      }}>
        <div style={{ fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>
          Assessment failed
        </div>
        <div style={{ color: 'var(--muted)', marginBottom: 8 }}>
          {assessment.error_message || 'The AI service could not complete this request.'}
        </div>
        {assessment.error_kind && (
          <div style={{ fontSize: 11, color: 'var(--muted-dim)', fontFamily: 'monospace' }}>
            error_kind: {assessment.error_kind}
          </div>
        )}
      </div>
    )
  }

  // If the AI said "out of scope" or "insufficient info", render a
  // focused explanation rather than a bunch of empty sections.
  if (out.status === 'out_of_scope' || out.status === 'insufficient_info') {
    return (
      <div>
        <UrgencyBanner urgency={out.urgency} />

        <div style={{
          padding: 16, borderRadius: 10, marginBottom: 12,
          background: 'rgba(232,184,46,0.08)', border: '1px solid rgba(232,184,46,0.3)',
        }}>
          <div style={{ fontWeight: 700, color: 'var(--gold)', marginBottom: 8, fontSize: 14 }}>
            {out.status === 'out_of_scope'
              ? 'Out of scope for Phase 1'
              : 'Insufficient information for a meaningful assessment'}
          </div>
          {out.clinical_summary && (
            <div style={{ fontSize: 13, color: 'var(--ivory)', lineHeight: 1.5, marginBottom: 12 }}>
              {out.clinical_summary}
            </div>
          )}
          {out.clinical_uncertainty?.reason_evidence_insufficient && (
            <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              <strong>Why:</strong> {out.clinical_uncertainty.reason_evidence_insufficient}
            </div>
          )}
        </div>

        {/* Still show missing information + recommended next steps even
            when out-of-scope — the AI may suggest what data to collect. */}
        {Array.isArray(out.missing_information) && out.missing_information.length > 0 && (
          <Section title="Missing Information">
            {out.missing_information.map((m, i) => (
              <MissingInfoItem key={i} item={m} />
            ))}
          </Section>
        )}

        {Array.isArray(out.recommended_next_steps) && out.recommended_next_steps.length > 0 && (
          <Section title="Suggested Next Steps">
            {out.recommended_next_steps.map((s, i) => (
              <NextStepItem key={i} step={s} onCopy={() => onCopyToConsultation?.('next_step', s)} />
            ))}
          </Section>
        )}

        <SelfReportedLimitations text={out.self_reported_limitations} />
      </div>
    )
  }

  // ---- Normal "completed" assessment --------------------------------
  return (
    <div>
      <UrgencyBanner urgency={out.urgency} />

      {/* Clinical summary */}
      {out.clinical_summary && (
        <Section title="Clinical Summary">
          <div style={{ fontSize: 13, color: 'var(--ivory)', lineHeight: 1.6 }}>
            {out.clinical_summary}
          </div>
        </Section>
      )}

      {/* Differential diagnoses */}
      {Array.isArray(out.differential_diagnoses) && out.differential_diagnoses.length > 0 && (
        <Section title={`Differential Diagnoses (${out.differential_diagnoses.length})`}>
          {out.differential_diagnoses.map((d, i) => (
            <DifferentialDxItem
              key={i}
              rank={i + 1}
              dx={d}
              onCopy={() => onCopyToConsultation?.('differential_dx', d)}
            />
          ))}
        </Section>
      )}

      {/* Recommended next steps */}
      {Array.isArray(out.recommended_next_steps) && out.recommended_next_steps.length > 0 && (
        <Section title={`Recommended Next Steps (${out.recommended_next_steps.length})`}>
          {out.recommended_next_steps.map((s, i) => (
            <NextStepItem key={i} step={s} onCopy={() => onCopyToConsultation?.('next_step', s)} />
          ))}
        </Section>
      )}

      {/* Investigation interpretation */}
      {Array.isArray(out.investigation_interpretation) && out.investigation_interpretation.length > 0 && (
        <Section title={`Investigation Interpretation (${out.investigation_interpretation.length})`}>
          {out.investigation_interpretation.map((inv, i) => (
            <InvestigationItem key={i} inv={inv} />
          ))}
        </Section>
      )}

      {/* Medication safety review */}
      {out.medication_safety_review?.reviewed && (
        <Section title="Medication Safety Review">
          <MedicationSafetyReview review={out.medication_safety_review} />
        </Section>
      )}

      {/* Missing information */}
      {Array.isArray(out.missing_information) && out.missing_information.length > 0 && (
        <Section title={`Missing Information (${out.missing_information.length})`}>
          {out.missing_information.map((m, i) => (
            <MissingInfoItem key={i} item={m} />
          ))}
        </Section>
      )}

      {/* Clinical uncertainty */}
      {out.clinical_uncertainty && (
        <Section title="Clinical Uncertainty">
          <ClinicalUncertaintyBlock uncertainty={out.clinical_uncertainty} />
        </Section>
      )}

      {/* Evidence & references */}
      {Array.isArray(out.evidence_and_references) && out.evidence_and_references.length > 0 && (
        <Section title={`Evidence & References (${out.evidence_and_references.length})`}>
          {out.evidence_and_references.map((e, i) => (
            <EvidenceItem key={i} ev={e} />
          ))}
        </Section>
      )}

      <SelfReportedLimitations text={out.self_reported_limitations} />
    </div>
  )
}

// ---------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------

function Section({ title, children }) {
  return (
    <div style={{
      padding: 14, borderRadius: 10, marginBottom: 12,
      background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: 1,
        color: 'var(--teal)', textTransform: 'uppercase', marginBottom: 10,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------
// Differential diagnosis item
// ---------------------------------------------------------------------

function DifferentialDxItem({ rank, dx, onCopy }) {
  return (
    <div style={{
      padding: 12, borderRadius: 8, marginBottom: 8,
      background: 'var(--bg-card)', border: '1px solid var(--line-soft)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ivory)' }}>
            <span style={{ color: 'var(--teal)', marginRight: 6 }}>{rank}.</span>
            {dx.diagnosis}
            {dx.icd10_code && (
              <span style={{
                marginLeft: 8, fontSize: 10.5, fontWeight: 700,
                padding: '2px 8px', borderRadius: 12,
                background: 'rgba(118,87,232,0.14)', color: 'var(--violet)',
              }}>
                ICD-10 {dx.icd10_code}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ProvenanceTag provenance={dx.provenance} />
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: 'auto', padding: '4px 10px', fontSize: 11 }}
            onClick={onCopy}
            title="Copy this diagnosis to the consultation form"
          >
            Copy
          </button>
        </div>
      </div>

      {Array.isArray(dx.supporting_findings) && dx.supporting_findings.length > 0 && (
        <FindingList label="Supporting" items={dx.supporting_findings} color="var(--teal)" />
      )}
      {Array.isArray(dx.contradictory_findings) && dx.contradictory_findings.length > 0 && (
        <FindingList label="Contradictory" items={dx.contradictory_findings} color="var(--danger)" />
      )}
      {Array.isArray(dx.missing_information) && dx.missing_information.length > 0 && (
        <FindingList label="Missing" items={dx.missing_information} color="var(--gold)" />
      )}
    </div>
  )
}

function FindingList({ label, items, color }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, color, textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--ivory)', fontSize: 12 }}>
        {items.map((f, i) => <li key={i} style={{ marginBottom: 2, lineHeight: 1.45 }}>{f}</li>)}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------
// Recommended next step item
// ---------------------------------------------------------------------

function NextStepItem({ step, onCopy }) {
  const categoryColors = {
    examination: 'var(--teal)',
    investigation: 'var(--blue)',
    imaging: 'var(--violet)',
    referral: 'var(--danger)',
    follow_up: 'var(--gold)',
    other: 'var(--muted)',
  }
  const color = categoryColors[step.category] || 'var(--muted)'

  return (
    <div style={{
      padding: 10, borderRadius: 8, marginBottom: 6,
      background: 'var(--bg-card)', border: '1px solid var(--line-soft)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: 'var(--ivory)', fontWeight: 600, marginBottom: 3 }}>
          {step.step}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
          {step.reasoning}
        </div>
        <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
            background: `${color}22`, color,
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            {step.category}
          </span>
          <ProvenanceTag provenance={step.provenance} />
        </div>
      </div>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ width: 'auto', padding: '4px 10px', fontSize: 11, flexShrink: 0 }}
        onClick={onCopy}
      >
        Copy
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------
// Investigation interpretation item
// ---------------------------------------------------------------------

function InvestigationItem({ inv }) {
  const abnormal = inv.abnormal === true
  return (
    <div style={{
      padding: 10, borderRadius: 8, marginBottom: 6,
      background: 'var(--bg-card)', border: `1px solid ${abnormal ? 'rgba(240,79,95,0.3)' : 'var(--line-soft)'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ivory)' }}>
          {inv.test_name}
          {abnormal && (
            <span style={{
              marginLeft: 8, fontSize: 10, fontWeight: 700,
              padding: '2px 8px', borderRadius: 12,
              background: 'rgba(240,79,95,0.14)', color: 'var(--danger)',
              textTransform: 'uppercase',
            }}>
              Abnormal
            </span>
          )}
        </div>
        <div style={{ fontSize: 12.5, fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: abnormal ? 'var(--danger)' : 'var(--teal)' }}>
          {inv.result}{inv.unit ? ` ${inv.unit}` : ''}
        </div>
      </div>
      {inv.reference_range && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
          Reference: {inv.reference_range}
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--ivory)', marginTop: 6, lineHeight: 1.45 }}>
        {inv.interpretation}
      </div>
      {inv.trend && (
        <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 4 }}>
          Trend: {inv.trend}
        </div>
      )}
      {inv.limitations && (
        <div style={{ fontSize: 11, color: 'var(--muted-dim)', marginTop: 4, fontStyle: 'italic' }}>
          {inv.limitations}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Medication safety review
// ---------------------------------------------------------------------

function MedicationSafetyReview({ review }) {
  const concerns = Array.isArray(review.concerns) ? review.concerns : []
  if (concerns.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: 'var(--teal)' }}>
        No medication safety concerns identified based on the available data.
      </div>
    )
  }
  const severityColors = {
    info: 'var(--muted)',
    warning: 'var(--gold)',
    danger: 'var(--danger)',
  }
  return (
    <div>
      {concerns.map((c, i) => {
        const color = severityColors[c.severity] || 'var(--muted)'
        return (
          <div key={i} style={{
            padding: 10, borderRadius: 8, marginBottom: 6,
            background: `${color}11`, border: `1px solid ${color}44`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{
                fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                background: `${color}22`, color,
                textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                {c.type.replace(/_/g, ' ')} · {c.severity}
              </span>
              <ProvenanceTag provenance={c.provenance} />
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ivory)', lineHeight: 1.5 }}>
              {c.description}
            </div>
            {Array.isArray(c.medications_involved) && c.medications_involved.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Medications: {c.medications_involved.join(', ')}
              </div>
            )}
          </div>
        )
      })}
      {review.limitations && (
        <div style={{ fontSize: 11, color: 'var(--muted-dim)', marginTop: 8, fontStyle: 'italic' }}>
          {review.limitations}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Missing information item
// ---------------------------------------------------------------------

function MissingInfoItem({ item }) {
  return (
    <div style={{
      padding: 10, borderRadius: 8, marginBottom: 6,
      background: 'rgba(232,184,46,0.06)', border: '1px solid rgba(232,184,46,0.2)',
    }}>
      <div style={{ fontSize: 12.5, color: 'var(--gold)', fontWeight: 600, marginBottom: 3 }}>
        {item.item}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.45 }}>
        {item.why_it_matters}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Clinical uncertainty block
// ---------------------------------------------------------------------

function ClinicalUncertaintyBlock({ uncertainty }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, color: 'var(--ivory)', lineHeight: 1.5, marginBottom: 8 }}>
        {uncertainty.summary}
      </div>
      {Array.isArray(uncertainty.alternative_explanations) && uncertainty.alternative_explanations.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
            Alternative explanations
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--ivory)', fontSize: 12 }}>
            {uncertainty.alternative_explanations.map((a, i) => <li key={i} style={{ marginBottom: 2 }}>{a}</li>)}
          </ul>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
        {uncertainty.reason_evidence_insufficient}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Evidence & references item
// ---------------------------------------------------------------------

function EvidenceItem({ ev }) {
  return (
    <div style={{
      padding: 10, borderRadius: 8, marginBottom: 6,
      background: 'var(--bg-card)', border: '1px solid var(--line-soft)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>
        Supports: <span style={{ color: 'var(--ivory)' }}>{ev.suggestion}</span>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ivory)', fontWeight: 600 }}>
        {ev.source}
        {ev.retrieved === false && (
          <span style={{
            marginLeft: 8, fontSize: 10, fontWeight: 700,
            padding: '1px 6px', borderRadius: 10,
            background: 'rgba(232,184,46,0.14)', color: 'var(--gold)',
          }}>
            General knowledge — not retrieved
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted-dim)', marginTop: 3 }}>
        {ev.publication_date && <span>{ev.publication_date}</span>}
        {ev.jurisdiction && <span>{ev.publication_date ? ' · ' : ''}{ev.jurisdiction}</span>}
      </div>
      {ev.url && (
        <a href={ev.url} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, color: 'var(--teal)', marginTop: 4, display: 'inline-block', wordBreak: 'break-all' }}>
          {ev.url}
        </a>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Provenance tag — "documented" / "inferred" / "general_knowledge"
// ---------------------------------------------------------------------

function ProvenanceTag({ provenance }) {
  if (!provenance) return null
  const colors = {
    documented: { bg: 'rgba(0,199,199,0.14)', color: 'var(--teal)' },
    inferred: { bg: 'rgba(59,130,246,0.14)', color: 'var(--blue)' },
    general_knowledge: { bg: 'rgba(154,170,183,0.14)', color: 'var(--muted)' },
  }
  const cfg = colors[provenance] || colors.general_knowledge
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
      background: cfg.bg, color: cfg.color,
      textTransform: 'uppercase', letterSpacing: 0.5,
    }}>
      {provenance.replace(/_/g, ' ')}
    </span>
  )
}

// ---------------------------------------------------------------------
// Self-reported limitations — always shown at the bottom
// ---------------------------------------------------------------------

function SelfReportedLimitations({ text }) {
  if (!text) return null
  return (
    <div style={{
      padding: 12, borderRadius: 10,
      background: 'rgba(154,170,183,0.06)', border: '1px solid var(--line-soft)',
      fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.6, fontStyle: 'italic',
    }}>
      <strong style={{ color: 'var(--ivory)', fontStyle: 'normal' }}>AI self-reported limitations:</strong>{' '}
      {text}
    </div>
  )
}
