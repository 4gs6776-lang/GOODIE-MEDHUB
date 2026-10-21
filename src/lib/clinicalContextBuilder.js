// =====================================================================
// GOODIE-MEDHUB — Clinical Context Builder
//
// Assembles a structured clinical-context object from the patient's
// records in GOODIE-MEDHUB. This is the data bundle that gets sent
// to the AI provider (via the edge function, never directly).
//
// TWO IMPORTANT RULES:
//
// 1. PRIVACY: The browser-side function (buildClinicalContextPreview)
//    includes the patient's name and identifiers — because the doctor
//    is looking at their own patient and needs to see what's being
//    sent. The edge function (Batch 3) will call a SERVER-SIDE
//    builder that strips ALL personally-identifying information before
//    sending to the AI provider. The doctor sees the full picture;
//    the AI sees an anonymized version.
//
// 2. FACTS ONLY: This builder never invents data. If a field is
//    missing from the patient's record, it is omitted from the
//    context. The AI is told what's missing, not a fabricated value.
// =====================================================================

// ---------------------------------------------------------------------
// buildClinicalContext
//
// Inputs:
//   patient     — row from patients table
//   vitals      — row from patient_vitals (the encounter)
//   prescriptions — array of prescription rows (all statuses)
//   labResults  — array of lab_orders + lab_tests rows (mixed)
//   scans       — array of radiology_scans rows
//   options     — { anonymize: false } for browser preview,
//                              true for what the edge function sends to AI
//
// Returns: a plain JS object that matches the clinical-context schema
//          the AI prompt expects.
// ---------------------------------------------------------------------

export function buildClinicalContext({
  patient,
  vitals,
  prescriptions = [],
  labResults = [],
  scans = [],
  options = {},
}) {
  const anonymize = options.anonymize === true

  // ---- Patient demographics ------------------------------------------------
  // We always include age + gender + blood_group + genotype (clinically
  // relevant). We include the name ONLY if anonymize=false (browser
  // preview). The edge function calls with anonymize=true.
  const demographics = {
    age: computeAge(patient),
    gender: patient?.gender || null,
    blood_group: patient?.blood_group || null,
    genotype: patient?.genotype || null,
  }
  if (!anonymize) {
    demographics.full_name = patient?.full_name || null
    demographics.mrn = patient?.mrn || null
  }

  // ---- Encounter (the vitals row that triggered the consultation) --------
  const encounter = vitals ? {
    // Free-text clinical fields:
    chief_complaints: vitals.chief_complaints || null,
    history_presenting_complaint: vitals.history_presenting_complaint || null,
    past_medical_history: vitals.past_medical_history || null,
    past_surgical_history: vitals.past_surgical_history || null,
    drug_history: vitals.drug_history || null,
    allergy_history: vitals.allergy_history || null,
    family_social_history: vitals.family_social_history || null,
    examination_findings: vitals.examination_findings || null,
    clinical_notes: vitals.clinical_notes || null,
    treatment_plan: vitals.treatment_plan || null,
    follow_up_notes: vitals.follow_up_notes || null,

    // Structured clinical arrays:
    symptoms: Array.isArray(vitals.symptoms) ? vitals.symptoms : [],
    diagnoses: Array.isArray(vitals.diagnoses) ? vitals.diagnoses : [],

    // Vitals:
    vital_signs: {
      temperature: vitals.temperature || null,
      blood_pressure: vitals.blood_pressure || null,
      pulse_rate: vitals.pulse_rate || null,
      respiratory_rate: vitals.respiratory_rate || null,
      spo2: vitals.spo2 || null,
      weight: vitals.weight || null,
      height: vitals.height || null,
    },

    // Nurse observations + triage:
    urgency: vitals.urgency || null,
    nurse_notes: vitals.nurse_notes || null,
    assigned_doctor: anonymize ? null : (vitals.assigned_doctor || null),

    // Provenance:
    recorded_at: vitals.recorded_at || null,
    completed_at: vitals.completed_at || null,
  } : null

  // ---- Current medications (active or dispensed) -------------------------
  // Cancelled or draft prescriptions are excluded — they're not
  // currently being taken.
  const currentMedications = prescriptions
    .filter(p => p.status === 'active' || p.status === 'dispensed')
    .map(p => ({
      drug_name: p.drug_name || null,
      dosage: p.dosage || null,
      route: p.route || null,
      frequency: p.frequency || null,
      duration: p.duration || null,
      quantity: p.quantity || null,
      instructions: p.instructions || null,
      prescribed_at: p.prescribed_at || null,
    }))

  // ---- Recent lab results (last 30 days) ---------------------------------
  // We include only completed results. In-progress or cancelled tests
  // tell the AI nothing about the patient's current state.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const recentLabs = labResults
    .filter(l => l.status === 'completed' && l.resulted_at && l.resulted_at >= thirtyDaysAgo)
    .map(l => ({
      test_name: l.test_name || null,
      result: l.result != null ? String(l.result) : null,
      unit: l.result_unit || null,
      reference_range: l.reference_range || null,
      abnormal_flag: l.abnormal_flag || null,    // 'critical' | 'high' | 'low' | 'normal' | null
      result_notes: l.result_notes || null,
      resulted_at: l.resulted_at || null,
      verified_by: anonymize ? null : (l.verified_by || null),
    }))

  // ---- Recent imaging reports (last 30 days, text only) ------------------
  // We do NOT send images. We send only the radiology report text,
  // which a human radiologist has already interpreted.
  const recentScans = scans
    .filter(s => s.status === 'completed' && s.report && s.requested_at && s.requested_at >= thirtyDaysAgo)
    .map(s => ({
      modality: s.modality || null,           // 'X-Ray', 'CT', 'MRI', etc.
      body_part: s.body_part || null,
      report: s.report || null,
      requested_at: s.requested_at || null,
    }))

  // ---- Hospital config (used by AI to scope guidance) --------------------
  // The edge function adds jurisdiction + clinical_locale from the
  // hospitals table. The browser preview doesn't have access to that,
  // so this is filled in server-side.
  const hospital = {
    jurisdiction: options.jurisdiction || null,
    clinical_locale: options.clinical_locale || null,
  }

  // ---- Assemble the final context object ---------------------------------
  return {
    schema_version: 'v1',
    generated_at: new Date().toISOString(),
    anonymized: anonymize,
    demographics,
    encounter,
    current_medications: currentMedications,
    lab_results: recentLabs,
    imaging_reports: recentScans,
    hospital,
  }
}

// ---------------------------------------------------------------------
// computeAge
//
// The patients table has both `date_of_birth` and a cached `age`
// field (set at registration). We prefer the computed-from-DOB value
// because it's always current. Fall back to the cached field.
// ---------------------------------------------------------------------

function computeAge(patient) {
  if (!patient) return null

  // If date_of_birth is set, compute age from it
  if (patient.date_of_birth) {
    const dob = new Date(patient.date_of_birth)
    if (!isNaN(dob.getTime())) {
      const now = new Date()
      let age = now.getFullYear() - dob.getFullYear()
      const m = now.getMonth() - dob.getMonth()
      if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
      return age >= 0 ? age : null
    }
  }

  // Fallback to the cached age field
  if (patient.age != null && patient.age !== '') {
    const n = parseInt(patient.age, 10)
    return isNaN(n) ? null : n
  }

  return null
}

// ---------------------------------------------------------------------
// summarizeContextForDisplay
//
// A small helper for the UI: takes a clinical context object and
// returns a one-line summary like "35yo M, 3 meds, 5 recent labs, 1
// scan". Used in the AI Diagnostics page header.
// ---------------------------------------------------------------------

export function summarizeContextForDisplay(ctx) {
  if (!ctx) return 'No context'
  const demo = ctx.demographics || {}
  const ageGender = `${demo.age || '?'}yo ${demo.gender || '?'}`
  const meds = ctx.current_medications?.length || 0
  const labs = ctx.lab_results?.length || 0
  const scans = ctx.imaging_reports?.length || 0
  const parts = [ageGender]
  if (meds > 0) parts.push(`${meds} med${meds === 1 ? '' : 's'}`)
  if (labs > 0) parts.push(`${labs} lab${labs === 1 ? '' : 's'}`)
  if (scans > 0) parts.push(`${scans} scan${scans === 1 ? '' : 's'}`)
  return parts.join(', ')
}
