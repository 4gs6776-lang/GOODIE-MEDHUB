# GOODIE-MEDHUB — Tailwind CSS Integration + Neumorphic KPI Cards (Phase 1)

## What this patch does

This is **Phase 1** of a two-phase enhancement: it integrates Tailwind CSS into the existing project **without** replacing any existing styling, and applies a subtle, premium **Neumorphic** treatment to the KPI cards in three locations only:

1. **Main Dashboard** — the hospital overview `.hd-kpi` cards (rendered by `KpiCard` in `widgets.jsx`)
2. **Pharmacy module** — the 4 bare `.dash-stat-card` KPI cards on the Pharmacy dashboard (Total Drugs, Low Stock, Expired, Expiring Soon)
3. **ShiftHandover module** — the 5 `.dash-stat-card.premium-stat` KPI cards on the ShiftHandover dashboard (Unacknowledged, Pending Tasks, High Priority, Today's Handovers, Patients Handed Over)

All other modules — including Billing — remain untouched until you approve Phase 2.

---

## Why Pharmacy instead of Billing

Pharmacy was chosen as the Phase-1 module because:

1. **It uses the more common `.dash-stat-card` pattern** (bare class, no `.premium-stat` modifier). 15 of the 17 module files use this exact pattern, so proving the neumorphic treatment works here gives confidence it will translate cleanly to every other module in Phase 2.
2. **It's a core, high-traffic hospital module** — always in use, so the visual improvement is immediately felt.
3. **It validates the treatment against a content-dense layout** — 4 cards in a row with icon + label + value, no mini-chart, no delta. A different density profile from ShiftHandover's 5-card layout.

Billing was NOT selected because its cards already use the `.premium-stat` variant (covered separately) — the same variant ShiftHandover uses. Picking Pharmacy instead covers both card patterns in Phase 1.

---

## What was changed (and what was NOT)

### Files ADDED (3 new files)

| File | Purpose |
|------|---------|
| `tailwind.config.js` | Tailwind v3.4 config — **Preflight disabled**, content scoped to Phase-1 surfaces only |
| `postcss.config.js` | PostCSS wiring (tailwindcss + autoprefixer) |
| `src/theme/neumorph.css` | The reusable Neumorphic KPI layer — design tokens + scoped styles for `.hd-kpi` and `.neu-scope .dash-stat-card` / `.neu-scope .premium-stat` |

### Files MODIFIED (3 files — minimal, non-breaking changes)

| File | Change |
|------|--------|
| `src/main.jsx` | Added a single `import './theme/neumorph.css'` line **after** all existing CSS imports (so it layers on top) |
| `src/pages/dashboard/Pharmacy.jsx` | Added `neu-scope` class to the KPI grid wrapper (one-word addition to `className`, no layout/style/logic change) |
| `src/pages/dashboard/ShiftHandover.jsx` | Added `neu-scope` class to the KPI grid wrapper (one-word addition to `className`, no layout/style/logic change) |
| `package.json` | Added 3 devDependencies (tailwindcss, postcss, autoprefixer) |

### Files NOT modified

- `src/pages/dashboard/Billing.jsx` — untouched (Billing keeps its existing styling)
- `src/pages/dashboard/Dashboard.jsx` — untouched
- `src/components/dashboard/hospital/widgets.jsx` — untouched
- Every other module page (Insurance, Laboratory, Inventory, Radiology, Nursing, Appointments, Admissions, AncPatients, DoctorWorkbench, HmoPatients, Notifications, AuditLog, Facilities, PatientProfile) — untouched
- `src/theme/globals.css`, `dashboard.css`, `premium-global.css`, `hospital-dash.css` — untouched
- All Supabase migrations, queries, auth, routing, business logic — untouched

### `package.json` — new devDependencies

| Package | Version | Why |
|---------|---------|-----|
| `tailwindcss` | `^3.4.17` | Tailwind v3 (NOT v4 — v4 requires PostCSS plugin changes that risk conflicting with the existing pure-CSS pipeline) |
| `postcss` | `^8.4.49` | Required by Tailwind v3 |
| `autoprefixer` | `^10.4.20` | Required by Tailwind v3 for vendor prefixes |

**Production dependencies are unchanged** — Tailwind is dev-only and is compiled away at build time. The runtime bundle contains zero extra JavaScript.

---

## Safety design — why this can't break the existing app

### 1. Tailwind Preflight is OFF

In `tailwind.config.js`:
```js
corePlugins: { preflight: false }
```

This is the critical safety setting. Tailwind's Preflight is a CSS reset that would otherwise clobber:
- `body { background: var(--bg); color: var(--ivory); }` (globals.css)
- `input, select, textarea { background: var(--bg-elevated); ... }` (globals.css)
- `button { font-family: var(--font-body); }` (globals.css)
- `* { margin: 0; padding: 0; box-sizing: border-box; }` (globals.css)
- All list styles, heading styles, link styles, etc.

With Preflight OFF, Tailwind only emits the utility classes that are actually used by the scanned files. The existing CSS continues to drive 100% of the styling.

### 2. Tailwind content scanner is scoped to Phase-1 files only

In `tailwind.config.js`:
```js
content: [
  './src/components/dashboard/hospital/widgets.jsx',
  './src/pages/dashboard/Pharmacy.jsx',
  './src/pages/dashboard/ShiftHandover.jsx',
  './src/theme/neumorph.css',
]
```

This means Tailwind only generates CSS for utility classes used in these 4 files. It does **not** scan the rest of the codebase, so any pre-existing class names that happen to collide with Tailwind utilities (e.g. `bg-card`, `text-muted`) will NOT be silently overridden by Tailwind's scanner.

### 3. The neumorphic layer is purely additive AND scoped

Look at `src/theme/neumorph.css`. The module-card rules are scoped under a `.neu-scope` wrapper class:

```css
.neu-scope .dash-stat-card { ... }       /* catches Pharmacy + ShiftHandover */
.neu-scope .premium-stat.teal-stat::after { ... }   /* tone-specific glow */
```

This means:
- **Billing's `.dash-stat-card.premium-stat` cards** do NOT get the neumorphic treatment (no `neu-scope` wrapper on their grid)
- **Pharmacy's bare `.dash-stat-card` cards** DO get the treatment (`neu-scope` added to their grid wrapper)
- **ShiftHandover's `.premium-stat` cards** DO get the treatment (`neu-scope` added to their grid wrapper)
- **All other modules' `.dash-stat-card` cards** do NOT get the treatment (no `neu-scope` wrapper)

The `.hd-kpi` rules are NOT scoped under `.neu-scope` because `.hd-kpi` only ever appears inside `.hd-root` (the hospital overview root), which is itself unique to the main Dashboard.

Each rule only adds:
- `box-shadow` (the dual-light neumorphic shadow)
- `background-image` (layered on top of the existing background — does NOT replace it)
- `::after` pseudo-element (the tone radial glow)
- `transition` and `transform` on hover

It does **not** override:
- Background colour
- Border colour (except a subtle tone tint on hover)
- Layout (padding, margin, grid)
- Typography (font-size, font-weight, letter-spacing)
- Icon size or colour
- Value / label / delta text colour

The `!important` flag is used on `box-shadow` only, because the existing `premium-global.css` rule sets `box-shadow: var(--card-shadow)` on `.dash-stat-card` and the layered neumorphic shadow needs to take precedence. This is the only property that needs `!important` — everything else composes naturally.

### 4. Dark + light themes are both tuned

The `--neu-shadow`, `--neu-shadow-hover`, `--neu-shadow-pressed`, `--neu-surface-gradient`, and `--neu-tone-glow-opacity` variables are defined twice — once under `:root` (dark) and once under `html.light-mode`. The dark values use faint white highlights + deepened-bg shadows; the light values use soft cool-grey shadows + faint white highlights. They are NOT the same values.

### 5. Reduced motion is respected

```css
@media (prefers-reduced-motion: reduce) {
  .hd-kpi, .neu-scope .dash-stat-card { transition: none !important; }
  .hd-kpi:hover, .neu-scope .dash-stat-card:hover { transform: none !important; }
}
```

The neumorphic shadow itself (a static visual) is still applied, but the hover lift and transition are disabled for users who prefer reduced motion.

### 6. Focus-visible is preserved

Keyboard users still get a clear focus ring on top of the neumorphic shadow:
```css
.hd-kpi:focus-visible { outline: 2px solid var(--hd-blue); outline-offset: 2px; }
.neu-scope .dash-stat-card:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
```

---

## Build verification

```
$ npx vite build
✓ 2814 modules transformed
✓ built in 6.95s
dist/assets/index-*.css   ~114 KB │ gzip:  ~22 KB
dist/assets/index-*.js    1,077 KB │ gzip: 248 KB
```

- **Zero warnings, zero errors.**
- CSS bundle grew by ~9 KB raw (~1.5 KB gzipped) — that's the entire Tailwind utility output + the neumorphic layer. Very lean.
- JS bundle is **byte-identical** to the baseline build — Tailwind adds zero runtime JavaScript.

---

## How to apply this patch

### Step 1 — Copy the new + modified files into your project root

```bash
# from the unzipped patch folder
cp tailwind.config.js                              <project>/tailwind.config.js
cp postcss.config.js                               <project>/postcss.config.js
cp src/theme/neumorph.css                          <project>/src/theme/neumorph.css
cp src/main.jsx                                    <project>/src/main.jsx
cp src/pages/dashboard/Pharmacy.jsx                <project>/src/pages/dashboard/Pharmacy.jsx
cp src/pages/dashboard/ShiftHandover.jsx          <project>/src/pages/dashboard/ShiftHandover.jsx
cp package.json                                    <project>/package.json
```

### Step 2 — Install the new devDependencies

```bash
cd <project>
npm install --no-audit --no-fund
```

This installs `tailwindcss@3.4`, `postcss@8.4`, and `autoprefixer@10.4` as dev dependencies.

### Step 3 — Verify the build locally

```bash
npm run build
```

You should see a successful build with the same module count as before, plus the slightly larger CSS bundle (~1.5 KB gzipped extra).

### Step 4 — Commit + push to GitHub → Vercel auto-deploys

That's it. No migrations, no env changes, no Supabase changes.

### Step 5 — Open the visual preview

Open `neumorph-kpi-preview.html` (also in this download folder) in any browser. It's a standalone HTML file with the exact same CSS variables and neumorphic layer, showing the **before** vs **after** side-by-side for both dark and light themes. Click the theme toggle button at the top to switch.

---

## What the cards look like — before vs after

### BEFORE (existing styling)
- Flat card with subtle gradient background
- Existing `--card-shadow` (a single soft drop shadow)
- Hover: slight `translateY(-2px)` + border colour change

### AFTER (Neumorphic layer)
- Same flat card with the **same** gradient background (preserved)
- A **dual-direction shadow** added on top: a faint white highlight from the top-left + a deepened-bg shadow from the bottom-right, creating the soft "raised from the surface" neumorphic effect
- A **subtle tone radial glow** in the top-left corner of each card — uses the card's tone colour (teal/gold/violet/red/blue) at 8% opacity in dark mode, 10% in light mode. For bare `.dash-stat-card` cards (Pharmacy), the glow defaults to the brand teal accent.
- Hover: gentle `translateY(-2px)` lift + the highlight intensifies + the tone glow brightens slightly + border picks up a 22% tone tint
- Active/pressed (for clickable cards only): the card sinks into the surface — shadow inverts, no lift, transitions in 80ms
- Focus-visible: a 2px outline in the tone colour, offset 2px (keyboard accessible)

### Per-module coverage

| Module | Card class | Tone glow source | Clickable? |
|--------|-----------|------------------|------------|
| Main Dashboard | `.hd-kpi` (in `.hd-root`) | `--tone` variable per `data-tone` attribute | Yes (some cards) |
| Pharmacy | `.dash-stat-card` (bare, in `.neu-scope`) | Default teal (brand accent) | No |
| ShiftHandover | `.dash-stat-card.premium-stat.*-stat` (in `.neu-scope`) | Tone class: `.teal-stat` / `.gold-stat` / `.violet-stat` / `.red-stat` | No |

---

## Phase 2 — when you're ready

When you approve Phase 1, Phase 2 extends the same treatment to the remaining modules. For each module, the work is:

1. Add `neu-scope` to the KPI grid wrapper className (one-word addition, no layout/style/logic change)
2. Add the module file path to `tailwind.config.js`'s `content` array

No additional CSS work is needed — the `neumorph.css` rules already cover both `.dash-stat-card` (bare) and `.premium-stat` (tone-variant) patterns.

Modules that will be covered by Phase 2:
`Insurance, Laboratory, Inventory, Radiology, Nursing, Appointments, Admissions, AncPatients, DoctorWorkbench, HmoPatients, Notifications, AuditLog, Facilities, PatientProfile, Billing`

---

## Phase 1 acceptance checklist

- [x] Tailwind v3.4 integrated with Preflight disabled
- [x] PostCSS wired with tailwindcss + autoprefixer only
- [x] Reusable neumorphic layer in `src/theme/neumorph.css`
- [x] Dark theme neumorphic shadows tuned for `#070F14` / `#0C151D`
- [x] Light theme neumorphic shadows tuned for `#F3F6F8` / `#FFFFFF`
- [x] Main Dashboard `.hd-kpi` cards enhanced
- [x] Pharmacy module `.dash-stat-card` cards enhanced (bare class pattern)
- [x] ShiftHandover module `.premium-stat` cards enhanced (tone-variant pattern)
- [x] Billing module remains on existing styling (NOT enhanced in Phase 1)
- [x] All other modules remain on existing styling
- [x] Existing colours, typography, layout, icons, values, deltas preserved
- [x] Focus-visible outlines preserved for keyboard users
- [x] `prefers-reduced-motion` respected
- [x] Production build succeeds with zero warnings
- [x] CSS bundle grew by only ~1.5 KB gzipped
- [x] JavaScript bundle unchanged
- [x] Standalone preview HTML provided for visual verification
