# Remove Tailwind + Neumorphism + Multi-Theme — Revert Patch

## What this patch does

Removes ALL tailwind, neumorphism, and multi-theme changes from your project, restoring the dashboard to its original look (the premium card gradient + standard shadows that were there before any of the neumorphic work).

**This patch does NOT revert the HMS upgrade changes** (consultation history fix, lab test picker modal, payment register fix, monthly reports, alphabetical patient sort, EDD validation, HMO contract link). Those are all preserved. Only the tailwind/neumorph/theme changes are removed.

## Files to DELETE from your project (5 files)

These files were added by the neumorphic/tailwind patches. Delete them from your project:

```bash
rm tailwind.config.js
rm postcss.config.js
rm src/theme/neumorph.css
rm src/theme/themes.css
rm src/components/ThemePicker.jsx
```

## Files to REPLACE (21 files)

Copy these files from the patch over your existing ones:

### Core files (4)
| File | What changed |
|------|---------------|
| `package.json` | Removed `tailwindcss`, `postcss`, `autoprefixer` from devDependencies |
| `src/main.jsx` | Removed `import './theme/neumorph.css'` + `import './theme/themes.css'` + the accent-application code |
| `src/theme/premium-global.css` | Restored original body gradient + card gradient (`linear-gradient(165deg, var(--card-grad-a) 0%, var(--card-grad-b) 100%)`) + original button shadows (`rgba(0,199,199,.9)`) |
| `src/pages/dashboard/Dashboard.jsx` | Removed `ThemePicker` import + render |

### Module files with `neu-scope` class stripped (17)
All these files had `className="dash-stats neu-scope"` — the `neu-scope` class has been removed (reverted to just `className="dash-stats"`). No other changes were made to these files — all HMS upgrade changes (consultation rendering, lab picker, payment fix, alphabetical sort, monthly reports, etc.) are preserved.

| File |
|------|
| `src/pages/dashboard/Admissions.jsx` |
| `src/pages/dashboard/AncPatients.jsx` |
| `src/pages/dashboard/Appointments.jsx` |
| `src/pages/dashboard/AuditLog.jsx` |
| `src/pages/dashboard/DoctorWorkbench.jsx` |
| `src/pages/dashboard/Facilities.jsx` |
| `src/pages/dashboard/HmoPatients.jsx` |
| `src/pages/dashboard/Insurance.jsx` |
| `src/pages/dashboard/Inventory.jsx` |
| `src/pages/dashboard/Laboratory.jsx` |
| `src/pages/dashboard/Notifications.jsx` |
| `src/pages/dashboard/PatientProfile.jsx` |
| `src/pages/dashboard/Pharmacy.jsx` |
| `src/pages/dashboard/Radiology.jsx` |
| `src/pages/dashboard/Reports.jsx` |
| `src/pages/dashboard/ShiftHandover.jsx` |
| `src/components/PatientProfile.jsx` |

## Apply steps

1. **Delete the 5 files** listed above from your project

2. **Copy the 21 files** from this patch over your existing ones

3. **Reinstall dependencies** (removes tailwindcss from node_modules):
   ```bash
   cd <project>
   rm -rf node_modules package-lock.json
   npm install
   ```

4. **Commit + push to GitHub** → Vercel auto-deploys

## Build verification

- ✅ `npx vite build` succeeds — 2814 modules, 7.37s, zero warnings, zero errors
- ✅ CSS bundle: 104 KB (down from 117 KB — the tailwind/neumorph/themes CSS is gone)
- ✅ 0 neumorphic tokens in production CSS (`neu-raised`, `neu-surface`, `neu-inset` — all gone)
- ✅ 0 theme palettes in production CSS (`data-accent` — gone)
- ✅ Original card gradient restored (`linear-gradient(165deg, var(--card-grad-a) 0%, var(--card-grad-b) 100%)` — 5 references in CSS)
- ✅ Original button shadows restored (`rgba(0,199,199,.9)` — minified to `#00c7c7e6`)

## What's preserved (NOT reverted)

These HMS upgrade changes are still in the patched files:
- ✅ Consultation history fix (all 14 fields saved + rendered) — Migration 059 still needed
- ✅ Lab test picker modal (`LabTestPicker.jsx` still exists, DoctorWorkbench still uses it)
- ✅ Payment register fix (`CashierWorkspace` still inserts `payments` rows)
- ✅ Monthly Summary + Lab Report tabs in Reports.jsx
- ✅ Alphabetical patient sort in PatientAutocomplete, HmoPatients, AncPatients
- ✅ EDD validation + ANC banner in DoctorWorkbench
- ✅ HMO contract link (Migration 060 still needed)
- ✅ Login focus-ring fix (login-neo.css — the focus-within deepening, not neumorphism)

## What's removed

- ❌ Tailwind CSS (tailwind.config.js, postcss.config.js, tailwindcss/postcss/autoprefixer deps)
- ❌ Neumorphic styling (neumorph.css — dual opposing shadows, inset icons, accent halos)
- ❌ Multi-theme system (themes.css — 7 accent color palettes, ThemePicker.jsx component)
- ❌ `neu-scope` class on all 17 module files
- ❌ Card gradient change (restored to original `--card-grad-a/b`)
- ❌ Body gradient themeable overlay (restored to original `rgba(0,199,199,.045)`)
- ❌ Button shadow `color-mix()` (restored to original `rgba(0,199,199,.9)`)
