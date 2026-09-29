// =====================================================================
// GOODIE-MEDHUB — Expired-subscription write lock (the "brain")
//
// This file decides ONE thing: "may the app save this change right now?"
//
// It deliberately imports NOTHING. useOfflineTable.js imports this file,
// and if this file imported anything that imports useOfflineTable back,
// the app would crash with a circular-import error. Keeping it
// dependency-free makes that impossible.
//
// HOW IT WORKS
//   - useSubscriptionLock.js (a separate file) reads the hospital's
//     subscription status and tells this file about it.
//   - useOfflineTable.js calls assertWriteAllowed() before every
//     add / update / delete. If the hospital is locked, it throws a
//     friendly error and NOTHING is saved.
//
// THE LOCK IS ON ONLY WHEN status is 'expired' or 'suspended'.
// trialing / active / past_due / grace_period / cancelled / unknown
// (or no subscription row at all) => NOT locked. When in doubt, the app
// keeps working — a bug here must never stop real clinical work.
//
// READING DATA IS NEVER BLOCKED. Only writes go through this check.
// =====================================================================

const LOCKING_STATUSES = new Set(['expired', 'suspended'])

// Tables that stay fully writable while locked (approved by the owner):
//  - medication_administrations : a nurse must still chart a dose given
//  - patient_vitals             : vitals must still be recorded
//  - messages                   : staff communication
//  - audit_events               : the audit trail must never be blocked
const EXEMPT_TABLES = new Set([
  'medication_administrations',
  'patient_vitals',
  'messages',
  'audit_events',
])

// UPDATE-only exceptions, limited to specific fields.
// Why: when a nurse charts a dose, the app ALSO marks the prescription
// as 'dispensed'. If that follow-up update were blocked, the dose would
// be saved but the prescription would still look "active" and could be
// given twice. Likewise, taking a patient from the queue updates the
// patient's queue status. Only these exact fields are allowed, so
// editing a patient's real details (name, phone...) stays blocked.
const UPDATE_ONLY_FIELDS = {
  prescriptions: ['status', 'administered_at', 'administered_by'],
  patients: ['queue_status', 'queue_updated_at'],
}

export const WRITE_BLOCKED_EVENT = 'gm-subscription-write-blocked'

let state = { locked: false, status: null }
const listeners = new Set()

function publish(next) {
  if (next.locked === state.locked && next.status === state.status) return
  state = next // new object only when something changed (React relies on this)
  listeners.forEach((fn) => fn())
}

// Called by the hook with the status read from the database.
export function setLockFromStatus(status) {
  const clean = status || null
  publish({ locked: LOCKING_STATUSES.has(clean), status: clean })
}

// Called on sign-out / owner pages: no hospital => no lock.
export function clearLock() {
  publish({ locked: false, status: null })
}

export function getLockState() {
  return state
}

export function subscribeLock(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export class SubscriptionLockedError extends Error {
  constructor(status) {
    super(
      status === 'suspended'
        ? 'This hospital\u2019s subscription is suspended, so changes can\u2019t be saved right now. You can still view all records. Please contact your hospital admin.'
        : 'This hospital\u2019s subscription has expired, so changes can\u2019t be saved right now. You can still view all records. Please ask your hospital admin to renew.'
    )
    this.name = 'SubscriptionLockedError'
    this.status = status
  }
}

// Pure question: is this write allowed? (no throwing, easy to test)
export function isWriteAllowed(tableName, operation = 'write', updates = null) {
  if (!state.locked) return true
  if (EXEMPT_TABLES.has(tableName)) return true

  if (operation === 'update' && updates && UPDATE_ONLY_FIELDS[tableName]) {
    const allowed = UPDATE_ONLY_FIELDS[tableName]
    const keys = Object.keys(updates)
    if (keys.length > 0 && keys.every((k) => allowed.includes(k))) return true
  }
  return false
}

// The guard useOfflineTable.js calls before every write.
export function assertWriteAllowed(tableName, operation = 'write', updates = null) {
  if (isWriteAllowed(tableName, operation, updates)) return
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent(WRITE_BLOCKED_EVENT, { detail: { tableName } }))
    } catch {}
  }
  throw new SubscriptionLockedError(state.status)
}
