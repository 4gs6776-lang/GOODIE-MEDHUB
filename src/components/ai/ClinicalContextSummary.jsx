import { useMemo } from 'react'
import { summarizeContextForDisplay } from '../../lib/clinicalContextBuilder'

// =====================================================================
// GOODIE-MEDHUB — ClinicalContextSummary
//
// Shows the doctor what clinical context is available for this patient
// + encounter, BEFORE they click "Generate Assessment". This is
// transparent — the doctor sees exactly what data the AI will see
// (minus the patient's name and identifiers, which are stripped
// server-side by the edge function before reaching Gemini).
//
// Also shows after the assessment is generated, so the doctor can
// see what the assessment was based on.
// =====================================================================

export default function ClinicalContextSummary({ patient, vitals, prescriptions, labResults, scans }) {
  // Compute simple stats for the header line
  const summary = useMemo(() => {
    if (!patient) return null
    const age = patient.age || (patient.date_of_birth ? computeAgeFromDate(patient.date_of_birth) : null)
    const meds = (prescriptions || []).filter(p => p.status === 'active' || p.status === 'dispensed').length
    const labs = (labResults || []).filter(l => l.status === 'completed').length
    const imaging = (scans || []).filter(s => s.status === 'completed' && s.report).length

    return {
      age,
      gender: patient.gender || null,
      blood_group: patient.blood_group || null,
      meds,
      labs,
      imaging,
    }
  }, [patient, prescriptions, labResults, scans])

  if (!patient) {
    return (
      <div style={{
        padding: 14, borderRadius: 10,
        background: 'var(--bg-elevated)', border: '1px solid var(--line)',
        color: 'var(--muted)', fontSize: 13,
      }}>
        No patient selected.
      </div>
    )
  }

  // The actual data sections
  const hasVitals = vitals && (vitals.blood_pressure || vitals.temperature || vitals.pulse_rate || vitals.spo2)
  const hasComplaint = vitals && (vitals.chief_complaints || vitals.history_presenting_complaint)
  const hasHistory = vitals && (vitals.past_medical_history || vitals.drug_history || vitals.allergy_history)
  const hasExamination = vitals && vitals.examination_findings
  const hasSymptoms = vitals && Array.isArray(vitals.symptoms) && vitals.symptoms.length > 0
  const hasDiagnoses = vitals && Array.isArray(vitals.diagnoses) && vitals.diagnoses.length > 0

  const activeMeds = (prescriptions || []).filter(p => p.status === 'active' || p.status === 'dispensed')
  const recentLabs = (labResults || []).filter(l => l.status === 'completed' && l.result)
  const recentScans = (scans || []).filter(s => s.status === 'completed' && s.report)

  return (
    <div style={{
      padding: 14, borderRadius: 10,
      background: 'var(--bg-elevated)', border: '1px solid var(--line)',
    }}>
      {/* Header row: patient one-liner */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 8, marginBottom: 14,
        paddingBottom: 12, borderBottom: '1px solid var(--line-soft)',
      }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Clinical Context
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ivory)', marginTop: 3 }}>
            {patient.full_name}
            {summary?.age && ` · ${summary.age}yo`}
            {summary?.gender && ` · ${summary.gender}`}
            {summary?.blood_group && ` · ${summary.blood_group}`}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          {summary?.meds > 0 && <span style={{ marginRight: 10 }}>{summary.meds} medication{summary.meds === 1 ? '' : 's'}</span>}
          {summary?.labs > 0 && <span style={{ marginRight: 10 }}>{summary.labs} lab result{summary.labs === 1 ? '' : 's'}</span>}
          {summary?.imaging > 0 && <span>{summary.imaging} imaging report{summary.imaging === 1 ? '' : 's'}</span>}
          {summary?.meds === 0 && summary?.labs === 0 && summary?.imaging === 0 && (
            <span>no medications, labs, or imaging on record</span>
          )}
        </div>
      </div>

      {/* Data quality / availability disclosure */}
      <div style={{
        fontSize: 11, color: 'var(--muted)', marginBottom: 14,
        padding: '8px 10px', borderRadius: 6,
        background: 'rgba(0,199,199,0.04)', border: '1px solid var(--line-soft)',
        lineHeight: 1.5,
      }}>
        <strong style={{ color: 'var(--teal)' }}>Privacy:</strong>{' '}
        The AI receives an anonymized version of this context — no name, MRN, phone,
        address, or contact details. It sees age, gender, blood group, clinical
        findings, medications, and recent results only.
      </div>

      {/* Sections grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>

        <ContextSection
          title="Chief Complaint"
          available={hasComplaint}
          content={vitals?.chief_complaints || vitals?.history_presenting_complaint}
        />

        <ContextSection
          title="Vital Signs"
          available={hasVitals}
          content={
            hasVitals ? [
              vitals.blood_pressure && `BP ${vitals.blood_pressure}`,
              vitals.temperature && `Temp ${vitals.temperature}°C`,
              vitals.pulse_rate && `Pulse ${vitals.pulse_rate}`,
              vitals.respiratory_rate && `RR ${vitals.respiratory_rate}`,
              vitals.spo2 && `SpO2 ${vitals.spo2}%`,
              vitals.weight && `Wt ${vitals.weight}kg`,
              vitals.height && `Ht ${vitals.height}cm`,
            ].filter(Boolean).join(' · ') : null
          }
        />

        <ContextSection
          title="Symptoms"
          available={hasSymptoms}
          content={hasSymptoms
            ? vitals.symptoms.map(s => typeof s === 'string' ? s : (s.label || s.name || JSON.stringify(s))).join(', ')
            : null
          }
        />

        <ContextSection
          title="Diagnoses (current)"
          available={hasDiagnoses}
          content={hasDiagnoses
            ? vitals.diagnoses.map(d => d.code ? `${d.label} (${d.code})` : (d.label || d.name || JSON.stringify(d))).join(', ')
            : null
          }
        />

        <ContextSection
          title="Medical & Drug History"
          available={hasHistory}
          content={
            hasHistory
              ? [
                  vitals.past_medical_history && `PMH: ${vitals.past_medical_history}`,
                  vitals.drug_history && `Drugs: ${vitals.drug_history}`,
                  vitals.allergy_history && `Allergies: ${vitals.allergy_history}`,
                ].filter(Boolean).join(' · ')
              : null
          }
        />

        <ContextSection
          title="Examination Findings"
          available={hasExamination}
          content={vitals?.examination_findings}
        />

        <ContextSection
          title={`Current Medications (${activeMeds.length})`}
          available={activeMeds.length > 0}
          content={activeMeds.length > 0
            ? activeMeds.map(m =>
                `${m.drug_name}${m.dosage ? ` ${m.dosage}` : ''}${m.route ? ` ${m.route}` : ''}${m.frequency ? ` ${m.frequency}` : ''}`
              ).join('; ')
            : null
          }
        />

        <ContextSection
          title={`Recent Labs (${recentLabs.length})`}
          available={recentLabs.length > 0}
          content={recentLabs.length > 0
            ? recentLabs.slice(0, 5).map(l =>
                `${l.test_name}: ${l.result}${l.result_unit ? ` ${l.result_unit}` : ''}${l.abnormal_flag ? ` (${l.abnormal_flag})` : ''}`
              ).join('; ') + (recentLabs.length > 5 ? ` ... +${recentLabs.length - 5} more` : '')
            : null
          }
        />

        <ContextSection
          title={`Imaging Reports (${recentScans.length})`}
          available={recentScans.length > 0}
          content={recentScans.length > 0
            ? recentScans.slice(0, 3).map(s => `${s.modality} (${s.body_part})`).join('; ')
            : null
          }
        />

      </div>

      {/* Missing-data hint */}
      {!hasComplaint && (
        <div style={{
          marginTop: 12, padding: '8px 10px', borderRadius: 6,
          background: 'rgba(232,184,46,0.08)', border: '1px solid rgba(232,184,46,0.25)',
          fontSize: 11.5, color: 'var(--gold)', lineHeight: 1.5,
        }}>
          <strong>Heads up:</strong> No chief complaint is documented for this encounter.
          The AI assessment will likely return "insufficient information" — consider
          completing the consultation notes first.
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// ContextSection — one tile in the summary grid
// ---------------------------------------------------------------------

function ContextSection({ title, available, content }) {
  return (
    <div style={{
      padding: 10, borderRadius: 8,
      background: available ? 'var(--bg-card)' : 'transparent',
      border: `1px solid ${available ? 'var(--line-soft)' : 'var(--line)'}`,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
        color: available ? 'var(--teal)' : 'var(--muted-dim)', marginBottom: 5,
      }}>
        {title}
      </div>
      {available ? (
        <div style={{ fontSize: 12, color: 'var(--ivory)', lineHeight: 1.5, wordBreak: 'break-word' }}>
          {content}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: 'var(--muted-dim)', fontStyle: 'italic' }}>
          not documented
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// computeAgeFromDate — duplicated here to avoid a circular import
// (clinicalContextBuilder imports a lot; this small helper is all we need)
// ---------------------------------------------------------------------

function computeAgeFromDate(dobStr) {
  if (!dobStr) return null
  const dob = new Date(dobStr)
  if (isNaN(dob.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age >= 0 ? age : null
}
