// =====================================================================
// GOODIE-MEDHUB — PostCSS config (Tailwind integration only)
// =====================================================================
// Tailwind v3 is wired through PostCSS so Vite picks it up automatically
// when it processes any CSS file that contains `@tailwind` directives.
//
// autoprefixer is required by Tailwind v3 to add vendor prefixes for
// the utilities it generates (e.g. `-webkit-` for some properties).
//
// We intentionally do NOT add any other PostCSS plugins here — the
// existing CSS pipeline (pure .css files imported in main.jsx) must
// continue to work exactly as before.
// =====================================================================
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
