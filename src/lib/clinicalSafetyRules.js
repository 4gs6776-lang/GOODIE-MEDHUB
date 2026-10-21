// src/lib/clinicalSafetyRules.js
//
// Phase 1: ships EMPTY. The hospital admin must explicitly enable any rule.
// No rule is ever auto-enabled. No clinical threshold is invented.

export const RULES = [
  // ─── DRAFT rules (OFF by default, pending clinical approval) ───
  // {
  //   id: 'draft-critical-hyperkalemia',
  //   enabled: false,
  //   status: 'draft',
  //   description: 'Critical hyperkalemia — K+ > 6.5 mmol/L',
  //   reviewRequired: true,
  //   reviewer: 'pending clinical lead approval',
  //   evaluate: (ctx) => { ... }
  // },
  // {
  //   id: 'draft-suspected-sepsis',
  //   enabled: false,
  //   ...
  // },
]

export function evaluateCriticalRules(clinicalContext) {
  // Returns { warnings: [], rulesVersion: 'empty-v1' }
  // Phase 1 always returns empty — no rules are enabled.
  // The AI edge function still calls this BEFORE the Anthropic call,
  // so the wiring is in place for Phase 2.
  const warnings = []
  for (const rule of RULES) {
    if (!rule.enabled) continue
    const finding = rule.evaluate(clinicalContext)
    if (finding) warnings.push({ ruleId: rule.id, ...finding })
  }
  return { warnings, rulesVersion: 'empty-v1' }
}

export function getRulesManifest() {
  // Returns the human-readable manifest of all rules + their approval status.
  // Displayed in the AI Diagnostics UI so clinicians can see what is and
  // isn't actively checked.
  return RULES.map(r => ({
    id: r.id, enabled: r.enabled, status: r.status,
    description: r.description, reviewRequired: r.reviewRequired,
  }))
}
