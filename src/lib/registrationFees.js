// =====================================================================
// GOODIE-MEDHUB — src/lib/registrationFees.js
//
// Single source of truth for folder registration fees. The actual
// amounts live in the database (table: hospital_registration_fees) so
// each hospital can customize them via Settings → Registration Fees.
//
// These are the FALLBACK DEFAULTS used when the database hasn't been
// queried yet, when the migration hasn't been applied, or when a row
// is missing for some reason. They match the seed values in migration
// 031 — if you change one, change both.
//
// Categories: personal | family | emergency | anc | hmo
// =====================================================================

export const DEFAULT_REGISTRATION_FEES = {
  personal:  5000,
  family:   10000,
  emergency: 8000,
  anc:      30000,
  hmo:          0,
}

// Friendly labels for each folder category — used in dropdowns,
// Settings, and audit log entries.
export const FOLDER_CATEGORY_LABELS = {
  personal:  'Personal Folder',
  family:     'Family Folder',
  emergency:  'Emergency Folder',
  anc:        'ANC Folder',
  hmo:        'HMO Folder',
}

// Display order — keep it stable across the UI.
export const FOLDER_CATEGORY_ORDER = ['personal', 'family', 'emergency', 'anc', 'hmo']

// Resolve the fee for a single category. Falls back to the hard-coded
// default if the database row is missing or 0 wasn't explicitly set.
//
// Usage:
//   const fee = getFeeForCategory('personal', feeRecords)  // → 5000
export function getFeeForCategory(category, feeRecords) {
  if (!category) return 0
  const row = (feeRecords || []).find(f => f.category === category)
  if (row && row.is_active !== false) {
    return Number(row.amount || 0)
  }
  return Number(DEFAULT_REGISTRATION_FEES[category] || 0)
}

// Build a lookup map { category → amount } from the database records,
// filling in defaults for any category that has no row.
export function buildFeeMap(feeRecords) {
  const map = {}
  for (const cat of FOLDER_CATEGORY_ORDER) {
    map[cat] = getFeeForCategory(cat, feeRecords)
  }
  return map
}

// Format a fee as a Naira string. Returns "Free" for 0.
export function formatFee(amount) {
  const n = Number(amount || 0)
  if (n <= 0) return 'Free'
  return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// Build the label shown in the folder dropdown on the registration form.
// Example: "Personal Folder — ₦5,000"  or  "HMO Folder — Free"
export function folderOptionLabel(category, feeRecords) {
  const label = FOLDER_CATEGORY_LABELS[category] || category
  const amount = getFeeForCategory(category, feeRecords)
  return `${label} — ${formatFee(amount)}`
}
