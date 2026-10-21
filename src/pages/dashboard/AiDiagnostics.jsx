import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import PatientAutocomplete from '../../components/common/PatientAutocomplete'
import AppIcon from '../../components/icons'
import { writeAudit } from '../../lib/audit'
import { requestAssessment, getAssessmentHistory } from '../../lib/aiAssist'
import ClinicalContextSummary from '../../components/ai/ClinicalContextSummary'
import UrgencyBanner from '../../components/ai/UrgencyBanner'
import AssessmentReport from '../../components/ai/AssessmentReport'
import DocumentationDraft from '../../components/ai/DocumentationDraft'
import ClinicianReviewPanel from '../../components/ai/ClinicianReviewPanel'

// =====================================================================
// GOODIE-MEDHUB — AI Diagnostics page
//
// A full-screen overlay (same pattern as PatientProfile.jsx) that lets
// an authorized clinician:
//   1. Pick a patient (or use one passed in via props)
//   2. Pick an encounter (latest vitals row by default)
//   3. See the clinical context that will be sent to the AI
//   4. Click "Generate Assessment"
//   5. See the structured AI report (rendered by components from
//      Batches 5–7)
//   6. See prior assessments for the same patient
//
// This file (Batch 4) implements the PAGE SHELL: overlay, header,
// patient picker, encounter picker, context summary, generate button,
// loading state, error state. The actual assessment rendering
// (differential dx, recommendations, documentation draft, etc.) is
// added in Batch 5.
//
// For now, the assessment is rendered as a JSON preview so the page
// is functional end-to-end. Batch 5 will replace the JSON preview
// with the proper AssessmentReport component.
// =====================================================================

export default function AiDiagnostics({
  patientId: initialPatientId = null,
  encounterId: initialEncounterId = null,
  assessmentType: initialAssessmentType = 'consultation',
  onClose,
}) {
  const { profile, hospital } = useAuth()

  // ---- Data hooks (existing offline-first tables) --------------------
  const { records: patients, loading: loadingPatients } = useOfflineTable('patients', hospital?.id)
  const { records: vitals, loading: loadingVitals } = useOfflineTable('patient_vitals', hospital?.id)
  const { records: prescriptions } = useOfflineTable('prescriptions', hospital?.id)
  const { records: labOrders } = useOfflineTable('lab_orders', hospital?.id)
  const { records: labTests } = useOfflineTable('lab_tests', hospital?.id)
  const { records: scans } = useOfflineTable('radiology_scans', hospital?.id)

  // ---- State ----------------------------------------------------------
  const [selectedPatientId, setSelectedPatientId] = useState(initialPatientId)
  const [selectedEncounterId, setSelectedEncounterId] = useState(initialEncounterId)
  const [assessmentType, setAssessmentType] = useState(initialAssessmentType)
  const [assessment, setAssessment] = useState(null)         // the latest assessment
  const [history, setHistory] = useState([])                  // prior assessments
  const [loading, setLoading] = useState(false)              // generating assessment
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [error, setError] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [toast, setToast] = useState(null)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // ---- Resolved patient + encounter objects ---------------------------
  const patient = useMemo(
    () => patients.find(p => p.id === selectedPatientId) || null,
    [patients, selectedPatientId]
  )

  // Encounters for this patient (vitals rows), newest first
  const encounters = useMemo(() => {
    if (!selectedPatientId) return []
    return vitals
      .filter(v => v.patient_id === selectedPatientId)
      .sort((a, b) => new Date(b.recorded_at || b.created_at) - new Date(a.recorded_at || a.created_at))
  }, [vitals, selectedPatientId])

  // The selected encounter (or the latest if none picked)
  const encounter = useMemo(() => {
    if (selectedEncounterId) {
      return vitals.find(v => v.id === selectedEncounterId) || null
    }
    return encounters[0] || null
  }, [vitals, selectedEncounterId, encounters])

  // Patient's prescriptions, labs, scans (for the context summary)
  const patientPrescriptions = useMemo(
    () => prescriptions.filter(p => p.patient_id === selectedPatientId),
    [prescriptions, selectedPatientId]
  )
  const patientLabs = useMemo(() => {
    if (!selectedPatientId) return []
    return [
      ...labOrders.filter(l => l.patient_id === selectedPatientId),
      ...labTests.filter(l => l.patient_id === selectedPatientId),
    ]
  }, [labOrders, labTests, selectedPatientId])
  const patientScans = useMemo(
    () => scans.filter(s => s.patient_id === selectedPatientId),
    [scans, selectedPatientId]
  )

  // ---- Load history when patient changes ------------------------------
  useEffect(() => {
    if (!selectedPatientId || !hospital?.id) {
      setHistory([])
      return
    }
    let cancelled = false
    setLoadingHistory(true)
    getAssessmentHistory({ patientId: selectedPatientId, hospitalId: hospital.id })
      .then(rows => {
        if (!cancelled) {
          setHistory(rows)
          setLoadingHistory(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHistory([])
          setLoadingHistory(false)
        }
      })
    return () => { cancelled = true }
  }, [selectedPatientId, hospital?.id])

  // ---- Reset assessment when patient or encounter changes ------------
  useEffect(() => {
    setAssessment(null)
    setError(null)
  }, [selectedPatientId, selectedEncounterId])

  // ---- Role check (UI-level; the edge function also enforces) -------
  const allowedRoles = ['doctor', 'admin', 'nurse', 'owner']
  const roleAllowed = profile && allowedRoles.includes(profile.role)

  // Reviewer roles (can sign off on assessments — nurses can't)
  const reviewerRoles = ['doctor', 'admin', 'owner']
  const canReview = profile && reviewerRoles.includes(profile.role)

  // ---- Generate handler ----------------------------------------------
  async function handleGenerate() {
    if (!selectedPatientId) return setError('Please select a patient first.')
    if (!hospital) return setError('Hospital context is still loading.')
    if (!profile) return setError('Your account is still loading.')
    if (!roleAllowed) return setError(`Your role (${profile.role}) is not authorized to request AI assessments.`)

    setLoading(true)
    setError(null)
    setAssessment(null)

    try {
      const result = await requestAssessment({
        patientId: selectedPatientId,
        encounterId: selectedEncounterId || (encounter?.id || null),
        assessmentType,
        hospitalId: hospital.id,
        profile,
      })

      if (!result.success) {
        setError(result.error || 'The AI service could not complete the request.')
        return
      }

      setAssessment(result.assessment)

      // Audit: the requestAssessment() helper already wrote the audit
      // rows server-side via the edge function. This client-side audit
      // is for additional local visibility (e.g. for the dashboard's
      // "recent activity" feed).
      writeAudit({
        hospitalId: hospital.id, actor: profile,
        action: 'ai.assessment_received',
        entityType: 'ai_assessment',
        entityId: result.assessment?.id || null,
        patientId: selectedPatientId,
        summary: `AI assessment received — ${patient?.full_name || 'patient'} (${result.assessment?.status || 'unknown'})`,
        metadata: {
          status: result.assessment?.status,
          provider: result.assessment?.provider,
          model: result.assessment?.model,
          assessment_type: assessmentType,
        },
      })

      // Refresh history
      const refreshed = await getAssessmentHistory({ patientId: selectedPatientId, hospitalId: hospital.id })
      setHistory(refreshed)
    } catch (err) {
      setError(err?.message || 'Could not generate assessment.')
    } finally {
      setLoading(false)
    }
  }

  // ---- Render ---------------------------------------------------------

  // If the role isn't allowed, show a clean refusal.
  if (!roleAllowed && profile) {
    return (
      <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
        <div style={{ ...panelStyle, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ivory)', marginBottom: 10 }}>
            AI Diagnostics
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.5 }}>
            Your role ({profile.role}) is not authorized to request AI assessments.
            Only doctors, admins, and nurses (for triage) can use this feature.
          </div>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    )
  }

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div style={panelStyle}>

        {/* ---- Header ---- */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          padding: '18px 20px', borderBottom: '1px solid var(--line-soft)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ivory)' }}>
              AI Diagnostics
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              Phase 1 — adult general medicine only · Advisory only · Clinical responsibility remains with the qualified healthcare professional
            </div>
          </div>
          <button className="dash-icon-btn" onClick={onClose} aria-label="Close AI Diagnostics">
            <AppIcon name="close" size={18} />
          </button>
        </div>

        {/* ---- Body (scrollable) ---- */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* ---- Patient + encounter pickers ---- */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16,
          }}>
            <div>
              <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: 'var(--muted)', textTransform: 'uppercase' }}>
                Patient
              </label>
              <div style={{ marginTop: 6 }}>
                <PatientAutocomplete
                  patients={patients}
                  value={patient ? { id: patient.id, label: patient.full_name, patient } : null}
                  onChange={opt => {
                    setSelectedPatientId(opt?.patient?.id || null)
                    setSelectedEncounterId(null)
                  }}
                  placeholder="Search patient name…"
                  ariaLabel="Patient for AI assessment"
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: 'var(--muted)', textTransform: 'uppercase' }}>
                Encounter {encounters.length > 0 && `(${encounters.length})`}
              </label>
              <select
                value={selectedEncounterId || encounter?.id || ''}
                onChange={e => setSelectedEncounterId(e.target.value || null)}
                disabled={!selectedPatientId || encounters.length === 0}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8,
                  border: '1px solid var(--line)', background: 'var(--bg-elevated)',
                  color: 'var(--ivory)', fontSize: 13,
                  marginTop: 6,
                }}
              >
                {encounters.length === 0 ? (
                  <option value="">{selectedPatientId ? 'No encounters on record' : 'Select a patient first'}</option>
                ) : (
                  <>
                    <option value="">Latest encounter (auto)</option>
                    {encounters.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.recorded_at ? new Date(v.recorded_at).toLocaleString('en-NG') : '—'} · {v.status || 'unknown'} · {v.urgency || 'no urgency'}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
          </div>

          {/* ---- Assessment type ---- */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: 'var(--muted)', textTransform: 'uppercase' }}>
              Assessment type
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn ${assessmentType === 'consultation' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ width: 'auto', padding: '7px 14px', fontSize: 12 }}
                onClick={() => setAssessmentType('consultation')}
              >
                Consultation (doctor)
              </button>
              <button
                type="button"
                className={`btn ${assessmentType === 'triage' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ width: 'auto', padding: '7px 14px', fontSize: 12 }}
                onClick={() => setAssessmentType('triage')}
                disabled={!canReview && profile?.role !== 'nurse'}
                title={!canReview && profile?.role !== 'nurse' ? 'Triage assessments are for nurses and doctors' : ''}
              >
                Triage (nurse)
              </button>
            </div>
            {assessmentType === 'triage' && !canReview && (
              <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 5 }}>
                Triage assessments requested by nurses require doctor approval before any documentation can be saved.
              </div>
            )}
          </div>

          {/* ---- Clinical context summary ---- */}
          {patient ? (
            <div style={{ marginBottom: 16 }}>
              <ClinicalContextSummary
                patient={patient}
                vitals={encounter}
                prescriptions={patientPrescriptions}
                labResults={patientLabs}
                scans={patientScans}
              />
            </div>
          ) : (
            <div style={{
              padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13,
              background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--line)',
              marginBottom: 16,
            }}>
              {loadingPatients ? 'Loading patients…' : 'Search and select a patient to begin.'}
            </div>
          )}

          {/* ---- Generate button ---- */}
          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={loading || !selectedPatientId || !patient || !encounter}
              style={{ width: '100%', padding: '12px 16px', fontSize: 14 }}
            >
              {loading ? (
                <>
                  <AppIcon name="loading" size={16} spin />
                  Generating assessment…
                </>
              ) : (
                <>
                  <AppIcon name="activity" size={16} />
                  Generate AI Assessment
                </>
              )}
            </button>
            {selectedPatientId && !encounter && (
              <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 6, textAlign: 'center' }}>
                This patient has no encounters (vitals rows) on record. The AI needs at least one encounter to assess.
              </div>
            )}
          </div>

          {/* ---- Error state ---- */}
          {error && (
            <div style={{
              padding: '12px 14px', borderRadius: 10, marginBottom: 16,
              background: 'rgba(240,79,95,0.10)', border: '1px solid rgba(240,79,95,0.3)',
              color: 'var(--danger)', fontSize: 13, lineHeight: 1.5,
            }}>
              <strong>Could not generate assessment:</strong> {error}
            </div>
          )}

          {/* ---- Assessment output ---- */}
          {assessment && (
            <div style={{ marginBottom: 16 }}>

              {/* Assessment meta header */}
              <div style={{
                padding: '10px 14px', borderRadius: 10, marginBottom: 12,
                background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexWrap: 'wrap', gap: 8,
              }}>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Status: <strong style={{
                    color: assessment.status === 'completed' ? 'var(--teal)' :
                            assessment.status === 'insufficient_info' ? 'var(--gold)' :
                            assessment.status === 'out_of_scope' ? 'var(--gold)' :
                            assessment.status === 'failed' ? 'var(--danger)' : 'var(--ivory)',
                  }}>
                    {assessment.status || 'unknown'}
                  </strong>
                  {assessment.provider && ` · ${assessment.provider}`}
                  {assessment.model && ` · ${assessment.model}`}
                  {assessment.duration_ms && ` · ${(assessment.duration_ms / 1000).toFixed(1)}s`}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted-dim)' }}>
                  {assessment.completed_at ? new Date(assessment.completed_at).toLocaleString('en-NG') : '—'}
                </div>
              </div>

              {/* Urgency banner */}
              {assessment.structured_output?.urgency && (
                <UrgencyBanner urgency={assessment.structured_output.urgency} />
              )}

              {/* Deterministic safety warnings (if any) */}
              {Array.isArray(assessment.safety_warnings) && assessment.safety_warnings.length > 0 && (
                <div style={{
                  padding: '10px 14px', borderRadius: 10, marginBottom: 12,
                  background: 'rgba(240,79,95,0.08)', border: '1px solid rgba(240,79,95,0.3)',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                    Deterministic Safety Rule Findings
                  </div>
                  {assessment.safety_warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: 'var(--ivory)', marginBottom: 4 }}>
                      <strong>{w.finding}</strong>
                      {w.recommendation && <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{w.recommendation}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Full assessment report (differential dx, recommendations,
                  investigation interpretation, medication safety, missing
                  info, uncertainty, evidence) */}
              <AssessmentReport
                assessment={assessment}
                onCopyToConsultation={(type, item) => {
                  // Audit the copy action
                  writeAudit({
                    hospitalId: hospital.id, actor: profile,
                    action: 'ai.copied_to_consultation',
                    entityType: 'ai_assessment', entityId: assessment.id,
                    patientId: selectedPatientId,
                    summary: `AI ${type} suggestion copied to consultation — ${item.diagnosis || item.step || 'item'}`,
                    metadata: {
                      assessment_id: assessment.id,
                      suggestion_type: type,
                      suggestion_preview: (item.diagnosis || item.step || '').slice(0, 100),
                    },
                  })
                  // Copy to clipboard as the actual mechanism
                  try {
                    const text = item.diagnosis || item.step || JSON.stringify(item)
                    navigator.clipboard?.writeText(text)
                  } catch {}
                }}
              />

              {/* Editable documentation draft */}
              {assessment.structured_output?.documentation_draft && (
                <DocumentationDraft
                  key={assessment.id}
                  draft={assessment.structured_output.documentation_draft}
                  assessmentId={assessment.id}
                  hospitalId={hospital.id}
                  profile={profile}
                  onCopied={(text) => {
                    // The DocumentationDraft component handles its own
                    // audit + clipboard. This callback is for the parent
                    // to optionally close the overlay or pre-fill the
                    // Doctor Workbench form. For now, just show a toast.
                    showToast('Documentation draft copied to clipboard. Paste it into the Doctor Workbench consultation form.')
                  }}
                />
              )}

              {/* Clinician review panel */}
              <ClinicianReviewPanel
                assessment={assessment}
                profile={profile}
                hospitalId={hospital.id}
                onReviewed={(updated) => {
                  setAssessment(updated)
                  showToast('Review submitted.')
                }}
              />
            </div>
          )}

          {/* ---- Prior assessments ---- */}
          {selectedPatientId && (
            <div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: 'auto', padding: '7px 14px', fontSize: 12 }}
                onClick={() => setShowHistory(s => !s)}
              >
                {showHistory ? 'Hide' : 'Show'} prior assessments ({history.length})
              </button>

              {showHistory && (
                <div style={{ marginTop: 10 }}>
                  {loadingHistory ? (
                    <div style={{ padding: 12, color: 'var(--muted)', fontSize: 13 }}>Loading history…</div>
                  ) : history.length === 0 ? (
                    <div style={{ padding: 12, color: 'var(--muted)', fontSize: 13 }}>
                      No prior assessments for this patient (within the 90-day retention window).
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {history.map(h => (
                        <div
                          key={h.id}
                          onClick={() => setAssessment(h)}
                          style={{
                            padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                            background: assessment?.id === h.id ? 'rgba(0,199,199,0.10)' : 'var(--bg-elevated)',
                            border: `1px solid ${assessment?.id === h.id ? 'var(--teal-border)' : 'var(--line-soft)'}`,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            gap: 10,
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ivory)' }}>
                              {h.status} · {h.assessment_type}
                              {h.review_status && (
                                <span style={{
                                  marginLeft: 8, fontSize: 10, fontWeight: 700,
                                  padding: '2px 8px', borderRadius: 12,
                                  background: h.review_status === 'accepted' ? 'rgba(0,199,199,0.14)' :
                                              h.review_status === 'modified' ? 'rgba(232,184,46,0.14)' :
                                              'rgba(240,79,95,0.14)',
                                  color: h.review_status === 'accepted' ? 'var(--teal)' :
                                         h.review_status === 'modified' ? 'var(--gold)' :
                                         'var(--danger)',
                                }}>
                                  {h.review_status}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                              {h.requested_at ? new Date(h.requested_at).toLocaleString('en-NG') : '—'}
                              {h.requested_by_name && ` · ${h.requested_by_name}`}
                              {h.provider && ` · ${h.provider}`}
                            </div>
                          </div>
                          <AppIcon name="chevron" size={15} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {/* ---- Phase-1 disclosure footer ---- */}
        <div style={{
          padding: '10px 20px', borderTop: '1px solid var(--line-soft)',
          background: 'var(--bg-elevated)',
          fontSize: 11, color: 'var(--muted)', lineHeight: 1.5,
        }}>
          <strong>Phase 1 limitations:</strong> Adult general medicine only. Pediatric, obstetric, surgical, and psychiatric presentations return "out of scope". No validated critical-result thresholds are enabled. All AI suggestions are advisory and require clinician review before any action is taken.
        </div>

      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: '1px solid var(--teal)',
          color: 'var(--teal)', padding: '12px 20px', borderRadius: 10,
          fontSize: 13, fontWeight: 700, zIndex: 100, maxWidth: '85vw', textAlign: 'center',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Overlay + panel styles (match PatientProfile.jsx)
// ---------------------------------------------------------------------

const overlayStyle = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,3,26,0.78)',
  display: 'flex', alignItems: 'stretch', justifyContent: 'center',
  zIndex: 70, padding: 0,
}

const panelStyle = {
  width: '100%', maxWidth: 880,
  background: 'var(--bg)',
  display: 'flex', flexDirection: 'column',
  height: '100vh', maxHeight: '100vh',
  boxShadow: '0 0 60px rgba(0,0,0,0.4)',
}
