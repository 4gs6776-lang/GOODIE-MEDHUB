/** @type {import('tailwindcss').Config} */
// =====================================================================
// GOODIE-MEDHUB — Tailwind config (Phase 1: Neumorphic KPI cards only)
// =====================================================================
// SAFETY RULES (do not change without re-reading the user's brief):
//
// 1. `corePlugins.preflight = false`
//    Tailwind's base reset (Preflight) would otherwise clobber the
//    existing globals.css resets — body background, input/select
//    styling, button resets, list styles, etc. With Preflight OFF,
//    Tailwind only emits the utility classes we actually use.
//
// 2. `content` is intentionally narrow
//    Only the new neumorphic helper file + the 3 Phase-1 target
//    surfaces are scanned. This means Tailwind generates the SMALLEST
//    possible CSS bundle AND guarantees utility classes used anywhere
//    else in the app are NOT suddenly picked up by Tailwind's scanner
//    (which could change their behaviour or specificity).
//
// 3. `important: false` (default)
//    We do NOT want Tailwind to mark every utility `!important` — that
//    would override existing CSS variables and break the theme system.
//
// 4. Theme extension only, no replacement
//    We extend Tailwind's theme with the project's existing tokens
//    (referencing the CSS variables) so the neumorphic utilities can
//    use them by name. We do NOT add new colors or fonts that would
//    compete with the existing palette.
//
// Phase 2 (when the user approves extending to remaining modules)
// only needs to add more file paths to `content` — nothing else here
// changes.
// =====================================================================
export default {
  content: [
    './src/components/dashboard/hospital/widgets.jsx',
    './src/pages/dashboard/Pharmacy.jsx',
    './src/pages/dashboard/ShiftHandover.jsx',
    './src/theme/neumorph.css',
  ],
  // Disable Preflight — see safety rule #1 above.
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        // Map Tailwind color names to the project's CSS variables so
        // utilities like `bg-card`, `text-ivory`, `border-line` resolve
        // to the EXACT same colors the rest of the app uses — and they
        // automatically follow the dark/light theme toggle.
        card: 'var(--bg-card)',
        'card-elevated': 'var(--bg-elevated)',
        ivory: 'var(--ivory)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        'line-soft': 'var(--line-soft)',
        teal: 'var(--teal)',
        gold: 'var(--gold)',
        violet: 'var(--violet)',
        blue: 'var(--blue)',
        danger: 'var(--danger)',
        success: 'var(--success)',
        warning: 'var(--warning)',
      },
      borderRadius: {
        // Reuse the project's --radius token where possible.
        card: 'var(--radius)',
      },
      boxShadow: {
        // Neumorphic shadow presets. These are also defined as CSS
        // variables in neumorph.css so they can be consumed by
        // non-Tailwind CSS rules (the existing .premium-stat / .hd-kpi
        // classes). Defining them here too lets JSX use them as
        // `shadow-neu` / `shadow-neu-hover` / `shadow-neu-pressed`.
        'neu': 'var(--neu-shadow)',
        'neu-hover': 'var(--neu-shadow-hover)',
        'neu-pressed': 'var(--neu-shadow-pressed)',
      },
      transitionTimingFunction: {
        // Soft, slightly-eased curve for hover transitions —
        // matches the .18s ease used elsewhere in the app.
        neu: 'cubic-bezier(.2,.7,.2,1)',
      },
    },
  },
  plugins: [],
}
