// =====================================================================
// GOODIE-MEDHUB — Deterministic Clinical Safety Rules Engine
//
// This module runs BEFORE the AI is called. It evaluates the patient's
// clinical context against a set of deterministic, clinically-reviewed
// rules. If any rule fires, the AI call is skipped and the warning is
// returned immediately — we do NOT wait for an external AI provider
// when a known critical condition is detected.
//
// PHASE 1 STATUS: EMPTY. No rules are enabled. The engine is wired up
// and ready, but no clinical thresholds are invented.
//
// Why empty: every clinical rule (critical K+ threshold, sepsis
// screening criteria, shock index, stroke scales, etc.) must be
// reviewed and approved by a qualified clinical lead for the
// hospital's jurisdiction before it can be enabled. Inventing rules
// now would be irresponsible.
//
// The structure is here so that, when clinical rules ARE approved,
// they slot in here without touching any other file.
//
// Per the user's Q4(a) decision in Phase 1: ship the wiring, leave
// the rules OFF, mark them as "draft — pending clinical approval".
// =====================================================================

// ---------------------------------------------------------------------
// RULE DEFINITIONS
//
// Each rule has:
//   id            — stable identifier (never changes once shipped)
//   enabled       — boolean, must be explicitly set to true by an admin
//   status        — 'draft' | 'under_review' | 'approved' | 'retired'
//   description   — human-readable
//   reviewer      — who needs to approve this before it can be enabled
//   evaluate(ctx) — function that takes a clinical context and returns
//                   either null (no finding) or a finding object:
//                   { finding, severity, source_data, recommendation }
// ---------------------------------------------------------------------

export const RULES = [
  // ────────────────────────────────────────────────────────────────
  // DRAFT RULES — DISABLED, PENDING CLINICAL APPROVAL
  // Uncomment and set `enabled: true` ONLY after a qualified clinical
  // lead has reviewed and approved the threshold for your jurisdiction.
  // ────────────────────────────────────────────────────────────────

  // {
  //   id: 'draft-critical-hyperkalemia',
  //   enabled: false,
  //   status: 'draft',
  //   description: 'Critical hyperkalemia — serum potassium > 6.5 mmol/L',
  //   reviewer: 'pending clinical lead approval',
  //   evaluate: (ctx) => {
  //     const kLab = ctx.lab_results?.find(l =>
  //       /potassium|k\+|k\b/i.test(l.test_name || '') &&
  //       l.status === 'completed' &&
  //       l.result != null
  //     )
  //     if (!kLab) return null
  //     const value = parseFloat(kLab.result)
  //     if (isNaN(value) || value <= 6.5) return null
  //     return {
  //       finding: `Critical hyperkalemia: K+ = ${value} ${kLab.result_unit || 'mmol/L'}`,
  //       severity: 'critical',
  //       source_data: { test_name: kLab.test_name, value, unit: kLab.result_unit, resulted_at: kLab.resulted_at },
  //       recommendation: 'Escalate immediately per hospital protocol. Consider cardiac monitoring.',
  //     }
  //   },
  // },

  // {
  //   id: 'draft-suspected-sepsis-sirs',
  //   enabled: false,
  //   status: 'draft',
  //   description: 'SIRS criteria — suspected sepsis screening (2+ of 4 criteria)',
  //   reviewer: 'pending clinical lead approval',
  //   evaluate: (ctx) => { /* ... */ },
  // },

  // {
  //   id: 'draft-shock-index',
  //   enabled: false,
  //   status: 'draft',
  //   description: 'Shock index (HR/SBP) > 1.0 — possible hypovolemic or septic shock',
  //   reviewer: 'pending clinical lead approval',
  //   evaluate: (ctx) => { /* ... */ },
  // },

  // {
  //   id: 'draft-anaphylaxis-pattern',
  //   enabled: false,
  //   status: 'draft',
  //   description: 'Suspected anaphylaxis — acute rash + respiratory compromise + hypotension',
  //   reviewer: 'pending clinical lead approval',
  //   evaluate: (ctx) => { /* ... */ },
  // },

  // {
  //   id: 'draft-stroke-fast-positive',
  //   enabled: false,
  //   status: 'draft',
  //   description: 'Suspected stroke — FAST-positive presentation',
  //   reviewer: 'pending clinical lead approval',
  //   evaluate: (ctx) => { /* ... */ },
  // },
]

// ---------------------------------------------------------------------
// RULES VERSION
//
// Stored on every ai_assessments row so a clinician reviewing an old
// assessment knows which ruleset was active when it was generated.
// Bump this whenever a rule is added, removed, or its threshold changed.
// ---------------------------------------------------------------------

export const RULES_VERSION = 'empty-v1'

// ---------------------------------------------------------------------
// evaluateCriticalRules
//
// Called by the edge function BEFORE calling the AI provider.
// Returns an object: { warnings: [...], rulesVersion: 'empty-v1' }
//
// In Phase 1, `warnings` is always empty (no rules enabled). The
// engine is wired so that Phase 2 can add rules without touching
// any other file.
// ---------------------------------------------------------------------

export function evaluateCriticalRules(clinicalContext) {
  const warnings = []

  for (const rule of RULES) {
    // Only evaluate enabled rules. Phase 1 ships with ALL rules
    // disabled, so this loop is a no-op.
    if (!rule.enabled) continue

    try {
      const finding = rule.evaluate(clinicalContext)
      if (finding) {
        warnings.push({
          rule_id: rule.id,
          ...finding,
        })
      }
    } catch (err) {
      // A broken rule must NEVER block the AI call. Log and continue.
      console.warn(`[clinicalSafetyRules] Rule ${rule.id} threw:`, err)
    }
  }

  return { warnings, rulesVersion: RULES_VERSION }
}

// ---------------------------------------------------------------------
// getRulesManifest
//
// Returns a human-readable list of all known rules + their approval
// status. The AI Diagnostics UI shows this to clinicians so they can
// see exactly what is and isn't being checked.
//
// In Phase 1 this returns an empty list with `rulesVersion: 'empty-v1'`
// — the UI shows a clear "No deterministic safety rules are currently
// enabled. Phase 1 ships with the rules engine empty pending clinical
// approval." disclosure.
// ---------------------------------------------------------------------

export function getRulesManifest() {
  return {
    rulesVersion: RULES_VERSION,
    rules: RULES.map(r => ({
      id: r.id,
      enabled: r.enabled,
      status: r.status,
      description: r.description,
      reviewer: r.reviewer,
    })),
    // Phase-1 disclosure shown in the UI:
    disclosure:
      'Phase 1 — No deterministic safety rules are currently enabled. ' +
      'The rules engine is wired but empty, pending clinical lead approval. ' +
      'All safety assessment in Phase 1 comes from the AI provider.',
  }
}
