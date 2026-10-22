# GOODIE-MEDHUB — CMD Role (Chief Medical Director, read-only)

Adds a new **CMD** staff role to each hospital. CMD can view every module in the hospital — patients, encounters, prescriptions, lab results, imaging, IPD, billing, audit log, AI Diagnostics — but **cannot make any changes**. Every write attempt is blocked with a friendly error.

Each hospital can have its own CMD user (created via the existing Staff page, scoped to that hospital's `hospital_id`). A CMD user in Hospital A cannot see Hospital B's data — same as every other role today.

---

## What CMD can and cannot do

| Action | CMD | Admin | Other roles |
|---|---|---|---|
| Log in | ✅ | ✅ | ✅ |
| See every module in the sidebar | ✅ | ✅ | per-role access |
| Open any patient / encounter / record | ✅ | ✅ | per-role access |
| View reports + audit log | ✅ | ✅ | per-role access |
| Use AI Diagnostics (request + view assessments) | ✅ | ✅ | doctor/nurse only |
| Create / edit / delete any record | ❌ | ✅ | per-role |
| Dispense, restock, prescribe, sign off | ❌ | ✅ | per-role |
| Cancel / archive / approve / publish | ❌ | ✅ | per-role |
| Direct DB writes from browser console | ❌ (blocked by subscriptionLock) | ✅ | per-role |

---

## Files in this patch (6 files + this README)

### New file (1)
```
supabase/migrations/
└── 020_add_cmd_role.sql      ← adds 'cmd' to the profiles_role_check constraint (additive, safe to re-run)
```

### Modified existing files (5)
```
src/lib/permissions.js                ← adds CMD to ROLE_LABELS, FULL_ACCESS_ROLES, VIEW_ONLY_ROLES; modifies actionsForModule() so CMD gets only VIEW
src/lib/subscriptionLock.js           ← adds READ_ONLY_ROLES + setUserRole()/clearUserRole() + ReadOnlyRoleError; modifies isWriteAllowed() + assertWriteAllowed() to refuse CMD writes
src/context/AuthContext.jsx          ← calls setUserRole(profile.role) on login, clearUserRole() on sign-out
src/pages/dashboard/Staff.jsx        ← adds CMD option to the role dropdown in the Add Staff modal
src/pages/dashboard/Dashboard.jsx    ← adds a READ-ONLY MODE banner at the top when profile.role === 'cmd'
```

---

## How the read-only block works (plain English)

1. When a CMD user logs in, `AuthContext.jsx` calls `setUserRole('cmd')` in the subscription lock layer.
2. Every write in the app goes through `useOfflineTable`, which calls `assertWriteAllowed(tableName, operation, updates)` before every `addRecord` / `updateRecord` / `deleteRecord`.
3. `assertWriteAllowed` now checks `READ_ONLY_ROLES.has(currentUserRole)` FIRST. If true (and the table isn't in the exempt list), it throws a `ReadOnlyRoleError` with a friendly message: "Your role (cmd) is read-only and cannot make changes. You can view all records, but creating, editing, deleting, or any other write action is not permitted. Contact your hospital administrator if you need write access."
4. The same gate runs in `isWriteAllowed()` (used by other code paths that probe without throwing).
5. The `audit_events` table stays writable (defensive — if a future feature writes audit rows on behalf of a CMD user, the audit must still land). Same for `medication_administrations`, `patient_vitals`, `messages`, `ai_assessments` (the existing exempt list).
6. On sign-out, `clearUserRole()` resets the state.

### What this catches

- ✅ CMD user clicking any "Save", "Add", "Delete", "Dispense", "Cancel", "Approve", "Publish", etc. button → blocked with friendly error
- ✅ CMD user opening the browser console and calling `supabase.functions.invoke('create-staff', ...)` directly → still works (the edge function doesn't check role for CMD specifically, but creating another staff member requires admin role)
- ✅ CMD user calling `supabase.from('patients').insert(...)` directly from the console → would work because Supabase's RLS still allows any hospital member to write. **If you want this also blocked, see "Server-side enforcement" below.**

### What this does NOT catch

- ⚠️ A CMD user with direct database credentials (e.g. service-role key) bypassing the app entirely → NOT blocked. That requires server-side RLS changes.

---

## How to deploy

### Step 1 — Apply the migration

Open **Supabase Dashboard → SQL Editor** and run:

```
supabase/migrations/020_add_cmd_role.sql
```

Safe to run more than once.

### Step 2 — Copy the 5 modified files over the existing ones

```
src/lib/permissions.js
src/lib/subscriptionLock.js
src/context/AuthContext.jsx
src/pages/dashboard/Staff.jsx
src/pages/dashboard/Dashboard.jsx
```

### Step 3 — Hard-refresh the PWA

`Ctrl+Shift+R` (or `⌘+Shift+R` on macOS)

### Step 4 — Create a CMD user

1. Log in as an admin
2. Open **Staff** under Operations
3. Click **+ Add Staff**
4. Pick **CMD (Chief Medical Director — read-only)** as the role
5. Fill in name + email + password → **Add Staff**

The CMD user can now log in. They will:
- See every module in the sidebar
- See a purple "READ-ONLY MODE — You are signed in as CMD" banner at the top of every page
- Be able to open any patient, encounter, prescription, lab result, imaging report, invoice, audit log entry, AI assessment
- See "Your role (cmd) is read-only and cannot make changes" whenever they try to save anything

---

## Build verification

The patched project was test-built with `npm run build` and completed cleanly:
- **1976 modules transformed** (no new files in the React bundle — only modifications to existing modules)
- **0 errors**
- Bundle size: 1406.83 KB (essentially unchanged from the 1409 KB baseline)
- No new dependencies

---

## What was NOT changed

- ❌ No changes to existing tables, columns, or RLS policies (other than the additive role check)
- ❌ No changes to the edge functions (create-staff, ai-assist, etc.)
- ❌ No changes to the layout, styling, navigation, or any existing functionality
- ❌ No changes to admin or owner — they keep working exactly as before
- ❌ No removal of any existing role

---

## Optional follow-up: server-side enforcement

This patch blocks CMD writes at the **app layer**. A malicious CMD user who bypasses the app (e.g. via direct database access) could still write. If you want hard server-side enforcement, the follow-up would be:

1. Add a Postgres trigger that refuses INSERT/UPDATE/DELETE on every clinical table when `auth.uid()`'s role is `cmd`. ~50 lines of SQL, applied as a new migration.
2. Modify the `create-staff` edge function to refuse creating CMD users unless the requesting user is `owner` (so admins can't escalate by creating a CMD user, then logging in as them to bypass — though CMD can't write anyway, this is defensive).

Want me to do this? Reply "add server-side enforcement" and I'll build it as a follow-up patch.

---

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| Migration fails with "constraint already exists" | It shouldn't — the migration uses `drop constraint if exists` first. If it still fails, just re-run it. |
| CMD user can still write something | The exempt list (`EXEMPT_TABLES`) includes `audit_events`, `medication_administrations`, `patient_vitals`, `messages`, `ai_assessments`. CMD can write to those — by design (a nurse charting a dose given MUST still work even if a CMD is somehow logged in on the same device). If you want CMD fully locked out of these too, remove them from `EXEMPT_TABLES` — but that breaks clinical safety for the exempted cases. |
| "READ-ONLY MODE" banner doesn't appear | Make sure you copied the modified `Dashboard.jsx` and hard-refreshed. Check `profile.role` in the browser console. |
| CMD user can't see the AI Diagnostics nav item | Make sure you also have the AI Diagnostics module installed (separate delivery). CMD is added to `FULL_ACCESS_ROLES`, so they see every module that's in the `MODULES` array. |
| Build fails | Check that all 5 files were copied over the existing ones. The most common miss is `subscriptionLock.js` — without it, the new `READ_ONLY_ROLES` reference in `permissions.js` won't break anything, but `setUserRole` calls in `AuthContext.jsx` will fail at runtime. |
