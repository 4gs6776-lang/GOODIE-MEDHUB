// =====================================================================
// GOODIE-MEDHUB — src/lib/vitalsAlerts.js
//
// Helper functions for the early-warning alert system.
// Checks saved vitals against hospital-configured limits and creates
// alert rows when a threshold is crossed.
//
// Rules:
//   - Only admitted inpatients (adults) are checked
//   - Only vitals the app already stores are checked
//   - If no limits are configured, no alerts are created
//   - One alert per (vital, direction) per patient while previous is unresolved
//   - A worse reading creates a new alert
//   - Missing values create no score and no "safe" message
// =====================================================================

// Parse a numeric value from a string (handles "120/80" for BP → 120 systolic, 80 diastolic)
export function parseVitalValue(vitalName, rawValue) {
  if (rawValue == null || rawValue === '') return null
  const s = String(rawValue).trim()
  if (vitalName === 'systolic_bp' || vitalName === 'diastolic_bp') {
    // Blood pressure is stored as "120/80" — parse parts
    const parts = s.split(/[/\\]/)
    const num = parseFloat(parts[vitalName === 'systolic_bp' ? 0 : 1])
    return isNaN(num) ? null : num
  }
  const num = parseFloat(s)
  return isNaN(num) ? null : num
}

// Convert the vitals row's field names to the limit vital_name values
const VITAL_FIELD_MAP = {
  temperature: { field: 'temperature', unit: '°C', limit_name: 'temperature' },
  blood_pressure: { field: 'blood_pressure', unit: 'mmHg', limit_names: ['systolic_bp', 'diastolic_bp'] },
  pulse_rate: { field: 'pulse_rate', unit: 'bpm', limit_name: 'pulse_rate' },
  respiratory_rate: { field: 'respiratory_rate', unit: '/min', limit_name: 'respiratory_rate' },
  spo2: { field: 'spo2', unit: '%', limit_name: 'spo2' },
}

// Check a saved vitals row against configured limits.
// Returns an array of breach objects: [{ vitalName, value, unit, limitValue, limitDirection, severity, previousValue, previousTime }]
//
// Parameters:
//   vitalsRow  — the patient_vitals row just saved
//   limits     — array of hospital_vitals_limits rows (active only)
//   previousVitals — the previous vitals row for this patient (or null)
export function checkVitalsAgainstLimits(vitalsRow, limits, previousVitals) {
  if (!vitalsRow || !limits || limits.length === 0) return []

  const breaches = []

  for (const [fieldName, config] of Object.entries(VITAL_FIELD_MAP)) {
    const rawValue = vitalsRow[fieldName]
    if (rawValue == null || String(rawValue).trim() === '') continue  // missing = no score

    if (config.limit_names) {
      // Blood pressure — check both systolic and diastolic
      for (const limitName of config.limit_names) {
        const value = parseVitalValue(limitName, rawValue)
        if (value == null) continue
        const prevValue = previousVitals ? parseVitalValue(limitName, previousVitals[fieldName]) : null

        for (const limit of limits) {
          if (limit.vital_name !== limitName || !limit.is_active) continue
          const threshold = Number(limit.threshold)
          const isBreach = limit.direction === 'low' ? value < threshold : value > threshold
          if (isBreach) {
            breaches.push({
              vitalName: limitName,
              value: String(value),
              unit: config.unit,
              limitValue: threshold,
              limitDirection: limit.direction,
              severity: limit.severity,
              label: limit.label || null,
              previousValue: prevValue != null ? String(prevValue) : null,
              previousTime: previousVitals?.recorded_at || previousVitals?.created_at || null,
              recordedAt: vitalsRow.recorded_at || vitalsRow.created_at,
            })
          }
        }
      }
    } else {
      // Single-value vital (temperature, pulse, resp rate, spo2)
      const value = parseVitalValue(config.limit_name, rawValue)
      if (value == null) continue
      const prevValue = previousVitals ? parseVitalValue(config.limit_name, previousVitals[fieldName]) : null

      for (const limit of limits) {
        if (limit.vital_name !== config.limit_name || !limit.is_active) continue
        const threshold = Number(limit.threshold)
        const isBreach = limit.direction === 'low' ? value < threshold : value > threshold
        if (isBreach) {
          breaches.push({
            vitalName: config.limit_name,
            value: String(value),
            unit: config.unit,
            limitValue: threshold,
            limitDirection: limit.direction,
            severity: limit.severity,
            label: limit.label || null,
            previousValue: prevValue != null ? String(prevValue) : null,
            previousTime: previousVitals?.recorded_at || previousVitals?.created_at || null,
            recordedAt: vitalsRow.recorded_at || vitalsRow.created_at,
          })
        }
      }
    }
  }

  return breaches
}

// Build the human-readable reason text for an alert
// Example: "Oxygen 88% at 14:10, limit 92%. Previous 94%."
export function buildAlertReason(breach) {
  const vitalLabel = breach.vitalName === 'spo2' ? 'Oxygen' :
                     breach.vitalName === 'systolic_bp' ? 'Systolic BP' :
                     breach.vitalName === 'diastolic_bp' ? 'Diastolic BP' :
                     breach.vitalName === 'pulse_rate' ? 'Pulse' :
                     breach.vitalName === 'respiratory_rate' ? 'Respiratory rate' :
                     breach.vitalName === 'temperature' ? 'Temperature' :
                     breach.vitalName

  const time = new Date(breach.recordedAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
  let reason = `${vitalLabel} ${breach.value}${breach.unit || ''} at ${time}, ${breach.limitDirection === 'low' ? 'below' : 'above'} limit ${breach.limitValue}${breach.unit || ''}.`

  if (breach.previousValue) {
    const prevTime = breach.previousTime ? new Date(breach.previousTime).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : ''
    reason += ` Previous ${breach.previousValue}${breach.unit || ''}${prevTime ? ` at ${prevTime}` : ''}.`
  }

  return reason
}

// Check if a patient is eligible for early-warning alerts:
//   - Must be an admitted inpatient (admissions.status = 'active')
//   - Must be an adult (age >= 13 or date_of_birth indicates >= 13 years)
//   - NOT walk-in, outpatient, maternity (ANC), or newborn
//
// Returns: { eligible: bool, reason: string }
export function checkPatientEligibility(patient, admissions) {
  if (!patient) return { eligible: false, reason: 'No patient record' }

  // Check if patient is an admitted inpatient
  const activeAdmission = (admissions || []).find(a =>
    a.patient_id === patient.id && a.status === 'active'
  )
  if (!activeAdmission) {
    return { eligible: false, reason: 'Not an admitted inpatient' }
  }

  // Check age — must be >= 13 (adult, not pediatric)
  let age = patient.age
  if (age == null && patient.date_of_birth) {
    const dob = new Date(patient.date_of_birth)
    const now = new Date()
    age = now.getFullYear() - dob.getFullYear()
    const m = now.getMonth() - dob.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  }
  if (age != null && age < 13) {
    return { eligible: false, reason: `Patient is ${age} years old (pediatric — adult limits do not apply)` }
  }

  // Check category — exclude ANC/maternity
  if (patient.category === 'anc') {
    return { eligible: false, reason: 'ANC/maternity patient — adult limits do not apply' }
  }

  return { eligible: true, admission: activeAdmission }
}

// Check if there's already an unresolved alert for this patient + vital + direction
export function hasUnresolvedAlert(existingAlerts, patientId, vitalName, direction) {
  return (existingAlerts || []).some(a =>
    a.patient_id === patientId &&
    a.vital_name === vitalName &&
    a.limit_direction === direction &&
    a.status !== 'resolved'
  )
}

// Check if the new breach is worse than the existing unresolved alert
// (e.g. SpO2 was 91% (warning), now 87% (critical) — create a new alert)
export function isNewBreachWorse(existingAlerts, patientId, vitalName, direction, newSeverity) {
  const severityRank = { informational: 1, warning: 2, critical: 3 }
  const existing = (existingAlerts || []).find(a =>
    a.patient_id === patientId &&
    a.vital_name === vitalName &&
    a.limit_direction === direction &&
    a.status !== 'resolved'
  )
  if (!existing) return true  // no existing alert — always create
  const existingRank = severityRank[existing.severity] || 0
  const newRank = severityRank[newSeverity] || 0
  return newRank > existingRank  // only create if new severity is worse
}
