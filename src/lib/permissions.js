// =====================================================================
// GOODIE-MEDHUB — Centralized permissions (Stage 1)
//
// ONE source of truth for "who can do what", replacing the hardcoded
// ROLE_ACCESS / COMMON_ACCESS / FULL_ACCESS_ROLES arrays that used to
// live inside Dashboard.jsx plus the scattered `profile.role === 'admin'`
// checks.
//
// Design (Stage 1 decisions, approved):
//   - Role, Permission, Hospital (tenant), Facility and Department are
//     kept conceptually separate. This file only models ROLE → MODULE →
//     ACTIONS. Hospital/facility scoping is enforced by Supabase RLS,
//     and per-hospital customization (role_permissions table) is a
//     later stage — until then this matrix mirrors today's behaviour
//     EXACTLY, so nothing changes visually for any user.
//
//   - IMPORTANT HONESTY NOTE: Stage 1 permission checks live in the
//     app layer only. Supabase RLS still authorizes any hospital
//     member for any action on hospital data. Restrictive RLS by
//     role/action is planned for the security-hardening stage — do not
//     treat this matrix as a security boundary yet.
//
// Actions match the approved requirement list:
//   view, create, edit, delete, archive, cancel, approve, publish,
//   export, import, print, manage_settings
// =====================================================================

export const ACTIONS = {
  VIEW: 'view',
  CREATE: 'create',
  EDIT: 'edit',
  DELETE: 'delete',
  ARCHIVE: 'archive',
  CANCEL: 'cancel',
  APPROVE: 'approve',
  PUBLISH: 'publish',
  EXPORT: 'export',
  IMPORT: 'import',
  PRINT: 'print',
  MANAGE_SETTINGS: 'manage_settings',
}

export const ALL_ACTIONS = Object.values(ACTIONS)

export const FULL_ACCESS_ROLES = ['admin', 'owner']

export const ROLE_LABELS = {
  admin: 'Admin',
  owner: 'Owner',
  doctor: 'Doctor',
  nurse: 'Nurse',
  front_desk: 'Front Desk',
  pharmacist: 'Pharmacist',
  lab: 'Laboratory',
  billing: 'Billing',
  staff: 'Staff',
}

// Modules (keys match Dashboard nav items 1:1)
export const MODULES = [
  'overview', 'patients', 'reception', 'appointments', 'doctor', 'nursing',
  'ipd', 'admissions', 'handover', 'billing', 'pharmacy', 'laboratory',
  'radiology', 'inventory', 'staff', 'insurance', 'reports',
  'notifications', 'roster', 'messages', 'settings',
]

// What every role sees today (moved verbatim from Dashboard.jsx so nav
// behaviour is byte-for-byte identical after the refactor).
const COMMON_ACCESS = ['overview', 'roster', 'notifications', 'messages', 'settings']

const ROLE_MODULES = {
  doctor: [...COMMON_ACCESS, 'patients', 'appointments', 'doctor', 'ipd', 'admissions', 'handover'],
  nurse: [...COMMON_ACCESS, 'patients', 'appointments', 'nursing', 'ipd', 'admissions', 'handover'],
  front_desk: [...COMMON_ACCESS, 'patients', 'reception', 'appointments', 'insurance', 'admissions'],
  pharmacist: [...COMMON_ACCESS, 'patients', 'pharmacy', 'inventory', 'handover'],
  lab: [...COMMON_ACCESS, 'patients', 'laboratory', 'radiology', 'handover'],
  billing: [...COMMON_ACCESS, 'patients', 'billing', 'insurance'],
}

// Baseline for non-admin roles on modules they can already access:
// they may view, create and edit records — that is what the UI lets
// them do today. Destructive/confirming actions stay admin-only except
// where the current UI genuinely performs them (encoded in the
// overrides below so the matrix stays truthful).
const BASELINE_MODULE_ACTIONS = [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.EDIT]

// Role-specific additions that reflect features that ALREADY exist in
// the UI (not new grants):
//  - doctor deletes prescriptions from the Doctor Workbench
//  - lab deletes lab tests/orders and radiology scans (TrashIcon in UI)
//  - nurse archives/voids medication administrations (MAR corrections)
//  - front desk cancels appointments
const ROLE_ACTION_OVERRIDES = {
  doctor: {
    doctor: [ACTIONS.DELETE],
  },
  lab: {
    laboratory: [ACTIONS.DELETE],
    radiology: [ACTIONS.DELETE],
  },
  nurse: {
    nursing: [ACTIONS.ARCHIVE],
  },
  front_desk: {
    appointments: [ACTIONS.CANCEL],
  },
}

const moduleActionCache = new Map()

function actionsForModule(role, moduleKey) {
  const cacheKey = `${role}|${moduleKey}`
  const cached = moduleActionCache.get(cacheKey)
  if (cached) return cached

  let actions
  if (FULL_ACCESS_ROLES.includes(role)) {
    actions = ALL_ACTIONS
  } else if (ROLE_MODULES[role]?.includes(moduleKey)) {
    actions = new Set(BASELINE_MODULE_ACTIONS)
    const overrides = ROLE_ACTION_OVERRIDES[role]?.[moduleKey]
    if (overrides) overrides.forEach(a => actions.add(a))
    actions = [...actions]
  } else {
    actions = []
  }

  moduleActionCache.set(cacheKey, actions)
  return actions
}

// Can this role perform `action` on `module`?
export function can(role, action, moduleKey) {
  if (!role || !action || !moduleKey) return false
  return actionsForModule(role, moduleKey).includes(action)
}

// Can this role see the module at all (nav + route access)?
export function canAccessModule(role, moduleKey) {
  if (FULL_ACCESS_ROLES.includes(role)) return true
  return Boolean(ROLE_MODULES[role]?.includes(moduleKey))
}

// Same fallback behaviour Dashboard always had: an unknown role gets
// the common modules only.
export function getAccessibleModules(role) {
  if (FULL_ACCESS_ROLES.includes(role)) return [...MODULES]
  return [...(ROLE_MODULES[role] || COMMON_ACCESS)]
}

// Convenience object for components:
//   const perm = buildPermissions(profile?.role)
//   perm.can(ACTIONS.CREATE, 'patients')
export function buildPermissions(role) {
  return {
    role,
    isAdmin: role === 'admin',
    isOwner: role === 'owner',
    isFullAccess: FULL_ACCESS_ROLES.includes(role),
    can: (action, moduleKey) => can(role, action, moduleKey),
    canAccess: moduleKey => canAccessModule(role, moduleKey),
    modules: getAccessibleModules(role),
  }
}
