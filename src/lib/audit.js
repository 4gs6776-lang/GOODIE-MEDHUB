import { supabase } from './supabaseClient'

// =====================================================================
// GOODIE-MEDHUB — Audit trail helper (Stage 1)
//
// Writes one append-only row to `audit_events` (migration 007). The
// table has no UPDATE/DELETE policies, so once written an audit event
// cannot be edited or erased through the API.
//
// writeAudit() NEVER throws. An audit failure must not block the
// clinical action that produced it — failures are logged to the
// console so they can be spotted, and the caller continues.
//
// Stage 1 wires this into the sensitive actions that already exist
// (patient archival, staff deactivation). Patient merge (Stage 2) and
// queue-priority overrides will use the same helper.
// =====================================================================

export async function writeAudit({
  hospitalId,
  facilityId = null,
  actor = null,          // the acting user's profile row (id, role, full_name)
  action,                // e.g. 'patient.archive', 'staff.deactivate'
  entityType,            // e.g. 'patient', 'staff', 'prescription'
  entityId = null,
  patientId = null,
  summary = null,        // human-readable one-liner shown in the audit list later
  metadata = {},         // structured details (before/after values etc.)
}) {
  try {
    if (!hospitalId || !action || !entityType) {
      console.warn('writeAudit skipped — hospitalId, action and entityType are required')
      return false
    }

    const payload = {
      hospital_id: hospitalId,
      facility_id: facilityId || null,
      actor_id: actor?.id || null,
      actor_role: actor?.role || null,
      actor_name: actor?.full_name || null,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      patient_id: patientId || null,
      summary: summary || null,
      metadata,
    }

    const { error } = await supabase.from('audit_events').insert(payload)
    if (error) {
      // Common expected cause before migration 007 has been applied:
      // the table simply does not exist yet (PGRST205).
      console.warn('writeAudit could not save audit event:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.warn('writeAudit failed:', err?.message || err)
    return false
  }
}