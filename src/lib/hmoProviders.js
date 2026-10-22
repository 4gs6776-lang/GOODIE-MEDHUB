// =====================================================================
// GOODIE-MEDHUB — Shared list of HMO providers (Nigeria-focused)
//
// Used by:
//   - Reception.jsx registration form (HMO category)
//   - Insurance.jsx claim form
//   - HmoPatients.jsx module (for the breakdown-by-provider summary)
//
// "Self-Pay (No HMO)" is always first so reception can quickly mark a
// patient as having no insurance. "Other" is always last for the rare
// provider not in the list.
//
// Each entry has:
//   id    — stable slug, used for filtering/grouping (never displayed)
//   name  — display name (what the dropdown shows)
//   type  — 'public' | 'private' (for breakdown stats only; not enforced)
//
// To add a new HMO: append an entry to the array. Nothing else to change.
// =====================================================================

export const HMO_PROVIDERS = [
  // Sentinel: always first
  { id: 'self-pay', name: 'Self-Pay (No HMO)', type: 'private' },

  // Public
  { id: 'nhis', name: 'NHIS (National Health Insurance Scheme)', type: 'public' },
  { id: 'nhis-ec2', name: 'NHIS ECD (Employer-Contributory)', type: 'public' },
  { id: 'nhis-tiship', name: 'NHIS TISHIP (Students)', type: 'public' },
  { id: 'nhip-anambra', name: 'Anambra State Health Insurance (ASHIA)', type: 'public' },
  { id: 'bhsi-bauchi', name: 'Bauchi State Health Contributory Scheme', type: 'public' },
  { id: 'ecohis-enugu', name: 'Enugu State Health Insurance (ENSHIC)', type: 'public' },

  // Private — major nationals
  { id: 'hygeia', name: 'Hygeia HMO', type: 'private' },
  { id: 'axa-mansard', name: 'AXA Mansard Health', type: 'private' },
  { id: 'reliance-hmo', name: 'Reliance HMO', type: 'private' },
  { id: 'aiico', name: 'AIICO Multishield', type: 'private' },
  { id: 'avon-hmo', name: 'Avon HMO', type: 'private' },
  { id: 'greenbay', name: 'Greenbay Healthcare', type: 'private' },
  { id: 'clearline', name: 'Clearline HMO', type: 'private' },
  { id: 'u-wrap', name: 'United Healthcare International (U-WRAP)', type: 'private' },
  { id: 'hallmark', name: 'Hallmark HMO', type: 'private' },
  { id: 'mediplan', name: 'Mediplan Healthcare', type: 'private' },
  { id: 'zircon', name: 'Zircon Health', type: 'private' },
  { id: 'rfo', name: 'Redcare Healthcare', type: 'private' },
  { id: 'lifenest', name: 'Lifenest HMO', type: 'private' },
  { id: 'rohealth', name: 'Reliance HMO (RoHealth)', type: 'private' },

  // Private — regional / growing
  { id: 'oceanic', name: 'Oceanic Health', type: 'private' },
  { id: 'prime-meta', name: 'Prime Metropolis Health', type: 'private' },
  { id: 'premium', name: 'Premium Shield HMO', type: 'private' },
  { id: 'total-healthtrust', name: 'Total Health Trust', type: 'private' },
  { id: 'defence-hmo', name: 'Defence HMO', type: 'private' },
  { id: 'novo', name: 'Novo Health Africa', type: 'private' },
  { id: 'alliance-hmo', name: 'Alliance HMO', type: 'private' },
  { id: 'actograph', name: 'Acto Healthcare International', type: 'private' },

  // Sentinel: always last
  { id: 'other', name: 'Other (specify in notes)', type: 'private' },
]

// Quick lookup by id — used by HmoPatients.jsx for breakdown stats.
export const HMO_PROVIDER_BY_ID = HMO_PROVIDERS.reduce((acc, p) => {
  acc[p.id] = p
  return acc
}, {})

// Lookup by display name (for backward compat with old records that
// stored the provider as a string, not the id).
export function findProviderByName(name) {
  if (!name) return null
  const q = name.toLowerCase().trim()
  return HMO_PROVIDERS.find(p => p.name.toLowerCase() === q) || null
}

// Convenience: returns just the names, for any code that still wants
// the old plain-string list format.
export const HMO_PROVIDER_NAMES = HMO_PROVIDERS.map(p => p.name)
