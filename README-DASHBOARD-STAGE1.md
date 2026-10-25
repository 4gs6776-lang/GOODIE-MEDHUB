# GOODIE MEDHUB — Dashboard redesign, Stage 1

## What is in this bundle
New files
- src/components/dashboard/hospital/useHospitalDashboard.js  (reads your real data, role-aware)
- src/components/dashboard/hospital/widgets.jsx              (number counters, sparklines, ring, chart)
- src/theme/hospital-dash.css                                (all the new styling, dark + light)
- src/components/dashboard/DashboardOverview.legacy.jsx      (your OLD overview, kept as a backup)

Changed files (replace the originals)
- src/components/dashboard/DashboardOverview.jsx  (the new dashboard layout)
- src/main.jsx                                    (one added line: imports hospital-dash.css)
- src/pages/dashboard/Dashboard.jsx               (only the theme button changed: new sun/moon switch)

No new npm packages are needed. No database changes. No Supabase settings touched.

## How to install (step by step)
1. BACK UP FIRST. Copy your whole project folder, or run your backup script (backup.ps1 / backup.sh).
2. Unzip this bundle INTO the project root so the folders line up. Say "Replace" if asked.
3. Open a terminal in the project folder and run:  npm install   (safe, nothing new is added)
4. Run:  npm run build     -> it should finish with no red errors. If it shows errors, send them to me.
5. Run:  npm run dev       -> open the address it prints, sign in, open the Overview tab.

## What to check
- Dark mode and light mode (use the new sun/moon switch in the top bar).
- Resize the window / open on a phone: nothing should scroll sideways.
- Sign in as different roles (doctor, nurse, billing...): each should see only their own sections.
- Turn the internet off and refresh: the page should say "Offline - showing saved data".

## How to undo
- Put your backed-up copies of the three changed files back, OR
- Rename DashboardOverview.legacy.jsx back to DashboardOverview.jsx (restores the old dashboard).
- To undo only the darker app background: delete section "1. GLOBAL SURFACE TONES" in hospital-dash.css.
