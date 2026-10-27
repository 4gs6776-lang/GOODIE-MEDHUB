// =====================================================================
// GOODIE-MEDHUB — src/lib/moduleHistory.js
//
// Maps each module key to the audit event action prefixes and entity
// types that belong to it. Used by <ModuleHistoryModal> to filter the
// audit_events table down to "everything that happened in this module".
//
// Adding a new module here is enough — every page that renders a
// <ModuleHistoryModal moduleKey="..."> will pick up the new mapping.
// =====================================================================

// Each entry defines:
//   title       Human-readable module name (shown in the modal header)
//   prefixes    Array of action prefixes — an audit event matches if
//               its `action` starts with any of these (e.g. 'inventory.'
//               matches 'inventory.create', 'inventory.dispense', etc.)
//   entityTypes Optional array of entity_type values to also include
//               (for events that don't follow the prefix convention).
// =====================================================================

export const MODULE_HISTORY_MAP = {
  pharmacy: {
    title: 'Pharmacy History',
    prefixes: [
      'prescription.',
      'pharmacy.',
      'pharmacy_request.',    // ← pharmacy_request.dispensed / .rejected (note the underscore — without this, those events would be missed)
    ],
    entityTypes: ['prescription', 'pharmacy_request', 'pharmacy_sale'],
    description: 'Every prescription, dispensing, restock, walk-in sale, and pharmacy request.',
  },

  billing: {
    title: 'Billing History',
    prefixes: [
      'billing.',
      'invoice.',
      'payment.',
      'wallet.',
      'insurance.',
      'hospital_expense.',
      'credit_note.',
    ],
    entityTypes: ['invoice', 'payment', 'billable_charge', 'patient_wallet', 'patient_wallet_transaction', 'insurance_claim', 'hospital_expense', 'credit_note'],
    description: 'Every invoice generated, payment recorded, wallet transaction, insurance claim, and expense.',
  },

  inventory: {
    title: 'Inventory History',
    prefixes: [
      'inventory.',
    ],
    entityTypes: ['inventory_item', 'inventory_import'],
    description: 'Every item created, updated, restocked, dispensed, or imported.',
  },

  laboratory: {
    title: 'Laboratory History',
    prefixes: [
      'lab_order.',
      'lab_result.',
    ],
    entityTypes: ['lab_test', 'lab_order', 'lab_result'],
    description: 'Every lab order sent, result recorded, and result review action.',
  },

  radiology: {
    title: 'Radiology History',
    prefixes: [
      'radiology_scan.',
    ],
    entityTypes: ['radiology_scan'],
    description: 'Every radiology scan requested, completed, or reopened.',
  },

  reception: {
    title: 'Reception History',
    prefixes: [
      'patient.create',
      'patient.archive',
      'patient.profile_updated',
      'patient.registration_fee_',
      'appointment.',
    ],
    entityTypes: ['patient', 'appointment'],
    description: 'Every patient registered, archived, profile updated, and appointment action.',
  },

  nursing: {
    title: 'Nursing History',
    prefixes: [
      'vitals.',
      'handover.',
      'prescription.nurse_sent_to_pharmacy',
    ],
    entityTypes: ['vitals', 'handover', 'nursing_care'],
    description: 'Every vitals recording, shift handover, and pharmacy request from nursing.',
  },

  ipd: {
    title: 'IPD History',
    prefixes: [
      'ipd.',
      'admission.',
      'bed.',
    ],
    entityTypes: ['bed', 'admission', 'ipd_stay'],
    description: 'Every admission, bed management, discharge, and clearance action.',
  },

  appointments: {
    title: 'Appointments History',
    prefixes: [
      'appointment.',
    ],
    entityTypes: ['appointment'],
    description: 'Every appointment created, status changed, or cancelled.',
  },

  hmo: {
    title: 'HMO / Insurance History',
    prefixes: [
      'insurance.',
      'patient.registration_fee_',
    ],
    entityTypes: ['insurance_claim', 'patient'],
    description: 'Every HMO claim auto-filed, insurance action, and HMO patient registration.',
  },

  anc: {
    title: 'ANC Patients History',
    prefixes: [
      'patient.create',
      'patient.profile_updated',
      'patient.registration_fee_',
    ],
    entityTypes: ['patient'],
    description: 'ANC patient registrations, profile updates, and registration fee events.',
  },

  ai: {
    title: 'AI Diagnostics History',
    prefixes: [
      'ai.',
    ],
    entityTypes: ['ai_assessment'],
    description: 'Every AI assessment received and copied to consultation.',
  },

  staff: {
    title: 'Staff History',
    prefixes: [
      'staff.',
      'user.',
    ],
    entityTypes: ['profile', 'staff'],
    description: 'Staff account and password changes.',
  },

  facilities: {
    title: 'Facilities History',
    prefixes: [
      'facility.',
    ],
    entityTypes: ['facility'],
    description: 'Facility creation and updates.',
  },

  settings: {
    title: 'Settings History',
    prefixes: [
      'hospital.',
      'hospital_bank_account.',
      'hospital_registration_fees.',
      'hospital_payment_method.',
      'user.password_changed',
      'service_catalog.',
      'price_list.',
      'price_list_item.',
      'hmo_contract.',
      'expense_vendor.',
    ],
    entityTypes: ['hospital', 'hospital_bank_account', 'hospital_registration_fees', 'hospital_payment_methods', 'service_catalog', 'price_lists', 'price_list_items', 'hmo_contracts', 'expense_vendors'],
    description: 'Hospital settings, logo, bank accounts, registration fees, payment methods, service catalog, price lists, HMO contracts, expense vendors, and password changes.',
  },

  messages: {
    title: 'Messages History',
    prefixes: [
      'messages.',
    ],
    entityTypes: ['message'],
    description: 'Every message sent — DMs and department channel posts.',
  },
}

// Resolve a module key into its history config, with a safe fallback.
export function getModuleHistoryConfig(moduleKey) {
  return MODULE_HISTORY_MAP[moduleKey] || {
    title: 'Module History',
    prefixes: [],
    entityTypes: [],
    description: 'No filter configured for this module.',
  }
}

// Returns true if an audit event row matches the given module config.
// Used by <ModuleHistoryModal> to filter the records client-side
// (audit_events are already hospital-scoped via RLS).
export function eventMatchesModule(event, moduleConfig) {
  if (!event || !moduleConfig) return false
  const { prefixes = [], entityTypes = [] } = moduleConfig

  // Match on action prefix — e.g. 'inventory.create' matches prefix 'inventory.'
  if (event.action && prefixes.some(p => event.action.startsWith(p))) {
    return true
  }

  // Match on entity_type (when prefixes didn't match)
  if (event.entity_type && entityTypes.includes(event.entity_type)) {
    return true
  }

  return false
}
