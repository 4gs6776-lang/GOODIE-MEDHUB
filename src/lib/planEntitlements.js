// =====================================================================
// GOODIE-MEDHUB — Plan entitlements: which modules a plan includes and
// how many staff / patients it allows.
//
// Like subscriptionLock.js this file imports NOTHING, so it can be used
// from useOfflineTable.js without any risk of circular imports.
//
// SAFETY RULES (a bug here must never lock a hospital out of its data):
//   - Unknown plan, missing subscription, or data not loaded yet
//     => everything is allowed ("fail-open").
//   - Nothing here ever hides or deletes EXISTING data. It only hides
//     menu items for modules the plan doesn't include, and refuses to
//     ADD more staff/patients once the plan's number is reached.
//   - During a free trial ('trialing') ALL modules are open so the
//     hospital can try everything. Limits still follow the plan.
// =====================================================================

// Modules every hospital always has, whatever the plan.
const ALWAYS_ALLOWED = new Set([
  'overview', 'settings', 'subscription', 'messages', 'notifications',
])

// Modules included in Basic. Matches what the Basic plan advertises:
// "Patient records, Appointments, Basic billing" (+ the front desk,
// staff and roster pages any clinic needs to run day to day).
// Professional and Enterprise (value null) include every module.
const PLAN_MODULES = {
  basic: [
    'patients', 'reception', 'appointments', 'billing', 'staff', 'roster',
  ],
  professional: null,
  enterprise: null,
}

const EMPTY = {
  planSlug: null,
  status: null,
  limits: null,          // { max_staff, max_patients } — null = unlimited
  usage: { patients: null, staff: null },
}

let state = EMPTY
const listeners = new Set()

function publish(next) {
  if (JSON.stringify(next) === JSON.stringify(state)) return
  state = next // a NEW object only when something really changed
  listeners.forEach((fn) => fn())
}

export function setEntitlements({ planSlug, status, limits }) {
  publish({
    ...state,
    planSlug: planSlug || null,
    status: status || null,
    limits: limits && typeof limits === 'object' ? limits : null,
  })
}

export function setUsage({ patients, staff }) {
  publish({
    ...state,
    usage: {
      patients: Number.isFinite(patients) ? patients : state.usage.patients,
      staff: Number.isFinite(staff) ? staff : state.usage.staff,
    },
  })
}

export function clearEntitlements() {
  publish(EMPTY)
}

export function getEntitlements() {
  return state
}

export function subscribeEntitlements(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ---------------------------------------------------------------------
// Modules
// `ent` is optional: React components pass the snapshot they received
// from useSyncExternalStore so they re-render when it changes.
// ---------------------------------------------------------------------
export function isModuleAllowedByPlan(moduleKey, ent = state) {
  if (ALWAYS_ALLOWED.has(moduleKey)) return true
  if (!ent || !ent.planSlug) return true            // unknown => allow
  if (ent.status === 'trialing') return true        // trial => everything
  const allowed = PLAN_MODULES[ent.planSlug]
  if (allowed === undefined) return true            // unknown plan => allow
  if (allowed === null) return true                 // plan includes all
  return allowed.includes(moduleKey)
}

// ---------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------
const LIMIT_FIELD = { patients: 'max_patients', staff: 'max_staff' }
const LIMIT_LABEL = { patients: 'patients', staff: 'active staff accounts' }

// A number, or null when unlimited / unknown.
export function getLimit(kind, ent = state) {
  const raw = ent?.limits?.[LIMIT_FIELD[kind]]
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null
}

export class PlanLimitError extends Error {
  constructor(kind, limit) {
    super(
      `Your plan allows up to ${limit} ${LIMIT_LABEL[kind]} and that limit has been reached. ` +
      'Existing records are safe. Please ask your hospital admin to upgrade the plan.'
    )
    this.name = 'PlanLimitError'
    this.kind = kind
    this.limit = limit
  }
}

// Throws when ADDING one more would go over the plan limit.
// `currentCount` = how many exist right now.
export function assertWithinPlanLimit(kind, currentCount) {
  const limit = getLimit(kind)
  if (limit === null) return
  if (currentCount >= limit) throw new PlanLimitError(kind, limit)
}

// For the admin warning bar: anything at 90% or more of its limit.
export function getLimitWarnings(ent = state) {
  const out = []
  for (const kind of ['patients', 'staff']) {
    const limit = getLimit(kind, ent)
    const used = ent?.usage?.[kind]
    if (limit === null || limit === 0 || !Number.isFinite(used)) continue
    if (used >= limit) out.push({ kind, used, limit, level: 'reached' })
    else if (used >= Math.ceil(limit * 0.9)) out.push({ kind, used, limit, level: 'near' })
  }
  return out
}
