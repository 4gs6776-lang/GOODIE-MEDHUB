# History Button + Hospital Expenses + Messages Unread Fix

This patch delivers three related features:

1. **A "History" button in every clinical + financial module** — opens a
   modal showing every action recorded in that module (prescriptions
   dispensed in Pharmacy, invoices generated in Billing, items restocked
   in Inventory, etc.). It uses the existing `audit_events` table — same
   data source as the central Audit Log, just pre-filtered to one module.

2. **Hospital Expenses** — a new "Expenses" tab in the Billing module
   where admin/billing can record outgoing payments (salaries, rent,
   utilities, supplies, equipment, etc.) with category, payment method,
   reference number, and date. Includes today/week/month totals.

3. **Messages unread fix + Dashboard bell count fix** — messages now
   track TRUE read state per user per channel (via a new
   `message_channel_reads` table). The badge clears the moment you open
   a thread. The dashboard bell count now shows ONLY true unread items
   (unread subscription alerts + unread messages) instead of all status
   info like low stock and today's appointments.

---

## Files Delivered

### New files (create these in your repo)

| File | Purpose |
|------|---------|
| `src/lib/moduleHistory.js` | Maps each module key → audit event action prefixes + entity types |
| `src/components/ModuleHistoryModal.jsx` | The reusable History modal with Recent + Full views |
| `src/components/ModuleHistoryButton.jsx` | Thin wrapper button that opens the modal |
| `supabase/migrations/032_hospital_expenses.sql` | Hospital expenses table + RLS + realtime |
| `supabase/migrations/033_message_channel_reads.sql` | Per-user channel read tracking table |

### Patched files (replace existing)

| File | What changed |
|------|--------------|
| `src/pages/dashboard/Billing.jsx` | Added "Expenses" tab + History button + expense CRUD |
| `src/pages/dashboard/Messages.jsx` | Replaced 24h heuristic with true per-channel read tracking |
| `src/pages/dashboard/Dashboard.jsx` | Bell badge now shows true unread only (sub alerts + messages) |
| `src/pages/dashboard/Pharmacy.jsx` | Added History button |
| `src/pages/dashboard/Inventory.jsx` | Added History button |
| `src/pages/dashboard/Laboratory.jsx` | Added History button |
| `src/pages/dashboard/Radiology.jsx` | Added History button |
| `src/pages/dashboard/Reception.jsx` | Added History button |
| `src/pages/dashboard/Nursing.jsx` | Added History button |
| `src/pages/dashboard/IPD.jsx` | Added History button |
| `src/pages/dashboard/Appointments.jsx` | Added History button |
| `src/pages/dashboard/HmoPatients.jsx` | Added History button |
| `src/pages/dashboard/AncPatients.jsx` | Added History button |

---

## Step 1 — Run the database migrations (CRITICAL)

Before replacing any source files, apply the two new SQL migrations in
your Supabase dashboard:

1. Sign in to **supabase.com** → open your project
2. Click **SQL Editor** in the left sidebar
3. Click **+ New Query**
4. Open `supabase/migrations/032_hospital_expenses.sql` and paste its
   entire contents → click **Run**
5. Click **+ New Query** again
6. Open `supabase/migrations/033_message_channel_reads.sql` and paste
   its entire contents → click **Run**

You should see "Success. No rows returned." for each. This creates:
- `hospital_expenses` table (for the new Expenses tab)
- `message_channel_reads` table (for the unread message fix)

Without these migrations, the Expenses tab will error and the messages
fix won't work.

---

## Step 2 — Replace the source files

In your local clone of the GOODIE-MEDHUB repo, copy these files from
the patch folder over the existing ones:

### Create NEW files:

```
src/lib/moduleHistory.js                 → NEW (create this file)
src/components/ModuleHistoryModal.jsx    → NEW
src/components/ModuleHistoryButton.jsx    → NEW
```

### Replace EXISTING files:

```
src/pages/dashboard/Billing.jsx          → replace
src/pages/dashboard/Messages.jsx          → replace
src/pages/dashboard/Dashboard.jsx         → replace
src/pages/dashboard/Pharmacy.jsx          → replace
src/pages/dashboard/Inventory.jsx         → replace
src/pages/dashboard/Laboratory.jsx        → replace
src/pages/dashboard/Radiology.jsx         → replace
src/pages/dashboard/Reception.jsx        → replace
src/pages/dashboard/Nursing.jsx          → replace
src/pages/dashboard/IPD.jsx              → replace
src/pages/dashboard/Appointments.jsx     → replace
src/pages/dashboard/HmoPatients.jsx      → replace
src/pages/dashboard/AncPatients.jsx      → replace
```

The directory structure is:

```
GOODIE-MEDHUB-main/
└── src/
    ├── lib/
    │   └── moduleHistory.js              ← NEW
    ├── components/
    │   ├── ModuleHistoryModal.jsx        ← NEW
    │   └── ModuleHistoryButton.jsx       ← NEW
    └── pages/
        └── dashboard/
            ├── Billing.jsx              ← replace
            ├── Messages.jsx              ← replace
            ├── Dashboard.jsx             ← replace
            ├── Pharmacy.jsx              ← replace
            ├── Inventory.jsx             ← replace
            ├── Laboratory.jsx            ← replace
            ├── Radiology.jsx             ← replace
            ├── Reception.jsx             ← replace
            ├── Nursing.jsx              ← replace
            ├── IPD.jsx                   ← replace
            ├── Appointments.jsx          ← replace
            ├── HmoPatients.jsx           ← replace
            └── AncPatients.jsx           ← replace
```

Commit + push to GitHub. Vercel will rebuild automatically.

---

## What you get

### 1. History button (every clinical + financial module)

Every module listed below now has a "🛡 History" button in its panel
header (top-right of the main panel). Click it to open a modal with
TWO views:

- **Recent** — quick glance at the last 20 actions in this module
- **Full History** — paginated, filterable list (by date range, action,
  actor, search) of ALL actions ever recorded in this module

Each row shows: timestamp, action chip (color-coded by verb: green for
create/record, red for delete/cancel, blue for update, gold for
dispense/charge), summary, and actor name. Click any row to see full
metadata.

Modules with History button:

| Module | What gets recorded |
|--------|---------------------|
| Pharmacy | Prescriptions dispensed/cancelled, pharmacy requests from nurses, restocks |
| Billing | Invoices generated, payments recorded, wallet charges, insurance claims, expenses |
| Inventory | Items created/updated/restocked/dispensed, imports |
| Laboratory | Lab orders sent, results recorded |
| Radiology | Scans requested/completed/reopened |
| Reception | Patient registrations, profile updates, registration fee charges/waivers, appointment actions |
| Nursing | Vitals recorded, shift handovers, pharmacy requests sent |
| IPD | Admissions, bed management, discharges |
| Appointments | Created, status changes, cancellations |
| HMO Patients | HMO claim auto-filings, HMO patient registrations |
| ANC Patients | ANC patient registrations, profile updates |
| Messages | DMs and department channel posts |

The data comes from the existing `audit_events` table — same source as
the central Audit Log, just pre-filtered to one module.

### 2. Hospital Expenses (Billing → Expenses tab)

A new "Expenses" tab appears in the Billing module alongside Patient
Queue, Wallet Transactions, and Payments.

- **4 stat cards** at the top: Today's Expenses, This Week, This Month,
  Total Records
- **Filter bar**: category dropdown, date-from, date-to, search
- **"Record Expense" button** (admin/owner/billing only) opens a modal
  with: Category, Description, Amount, Payment Method, Date Paid,
  Reference Number
- **Table** of all expenses with: Date, Category, Description, Amount,
  Method, Reference, Recorded By, and Edit/Delete actions (delete is
  admin/owner only)

Pre-set expense categories:

1. Salaries & Wages
2. Rent
3. Utilities
4. Medical Supplies
5. Office Supplies
6. Equipment Purchase
7. Equipment Maintenance
8. Cleaning & Hygiene
9. Transport / Fuel
10. Bank Charges
11. Marketing
12. Miscellaneous

Each expense records a payment method (Cash / Bank Transfer / POS /
Cheque / Other) and an optional reference number — same pattern as
patient payments, so cashier reconciliation includes both.

### 3. Messages unread fix

Before this patch: the unread badge showed messages from others in
the last 24 hours. The badge NEVER cleared when you read them.

After this patch: the badge shows TRUE unread count. When you open a
thread, it's marked read instantly — the badge clears for that channel
within ~1 second. The `message_channel_reads` table records one row per
(hospital, user, channel_type, channel_key) with a `last_read_at`
timestamp. A message is "unread" for you if:

- You didn't send it
- Its `created_at` is AFTER your `last_read_at` for that channel
  (or you have no `last_read_at` row at all)

### 4. Dashboard bell count fix

Before this patch: the bell badge showed the count of ALL notification
items — including status info like low stock, ready lab results, and
today's appointments. The badge never reflected what was actually
"unread".

After this patch: the bell badge shows ONLY:

- Unread subscription alerts (admin only)
- Unread messages

Status info (low stock, ready labs, today's appointments) still appears
in the popover when you click the bell, but it no longer inflates the
badge count. If there's no unread subscription alert and no unread
message, the badge is hidden entirely.

---

## Verification

After deploying, test each feature:

### History button

1. Open **Pharmacy** → click the "🛡 History" button (top-right of the
   "Pharmacy Inventory" panel).
2. A modal opens with two tabs: "Recent (last 20)" and "Full History".
3. Switch to "Full History" — you should see every prescription
   dispense, restock, and pharmacy request ever recorded.
4. Filter by action (e.g., "prescription.dispensed") or by actor.
5. Click any row to see the full metadata (JSON).

Repeat for each module: Billing, Inventory, Lab, Reception, etc.

### Expenses tab

1. Open **Billing & Invoices** → click the "Expenses" tab.
2. Stat cards should show ₦0 for everything (no expenses recorded yet).
3. Click **"Record Expense"** → fill in: Category "Utilities",
   Description "NEPA bill October", Amount 25000, Method "Bank
   Transfer", Reference "TRX-12345" → Save.
4. The expense appears in the table, stat cards update.
5. Try the Edit and Delete buttons (Delete is admin/owner only).
6. Filter by category, date range, or search.

### Messages unread fix

1. Have another staff member send a message in a department channel
   (e.g., #pharmacy) or DM you.
2. Note the badge count on that channel in the sidebar.
3. Open the channel — the badge should clear within ~1 second.
4. Have them send another message — the badge reappears.
5. Open it — badge clears again.

### Dashboard bell count

1. Note the bell badge count on the dashboard (top-right).
2. Open the Messages page → mark all channels read by opening them.
3. Return to the dashboard — the bell badge should now show only unread
   subscription alerts (or be hidden entirely if you have none).
4. Have someone send you a message — the bell badge should increment
   by 1 within ~20 seconds (the Messages page refresh interval).

---

## Audit Trail

New audit actions emitted by this patch:

| Action | When |
|--------|------|
| `hospital_expense.created` | A new expense was recorded. |
| `hospital_expense.updated` | An expense was edited. |
| `hospital_expense.deleted` | An expense was deleted (admin/owner only). |

These all appear in:
- The module's own History modal (Billing → History)
- The central Audit Log (Operations → Audit Log)
- The hospital's audit_events table

---

## Build Verification

This patch was verified by running `vite build` — 2795 modules
transformed successfully, no errors. Output bundle is 2,053 KB
(559 KB gzipped) — same order of magnitude as the prior version.

---

## Rollback

To undo this patch:

1. Revert all source files in your GitHub repo
2. Drop the two new tables (optional — leaving them has no effect):
   ```sql
   drop table if exists public.message_channel_reads cascade;
   drop table if exists public.hospital_expenses cascade;
   ```

---

## Questions / Edge Cases

### What if a module has no audit events yet?

The History modal shows "No actions recorded in this module yet."
The "Full History" view shows 0 events.

### Can a non-admin see the History button?

Yes — every hospital member can see the History button. Audit events
are hospital-scoped (any member can read), so everyone can see what
happened in their module. Only the central Audit Log page (which shows
ALL events across ALL modules) is restricted to admin/owner.

### Can a non-admin record expenses?

Only admin / owner / billing roles can add or edit expenses. Other
roles can VIEW the Expenses tab (read-only) but won't see the "Record
Expense" button or the Edit/Delete actions. Only admin / owner can
delete expenses.

### What if I want to add a custom expense category?

The 12 pre-set categories are hard-coded in the migration's CHECK
constraint. To add a new category:

1. Edit migration 032 — add the new category to the CHECK constraint
2. Re-run the migration (drop + recreate the table — destructive!)
3. OR add the new category to the `EXPENSE_CATEGORIES` array in
   `Billing.jsx` (line ~220) — won't pass the DB CHECK constraint,
   so this won't work without the DB change too.

For a future iteration we can make the categories configurable per
hospital — similar to how the registration fees work in Settings.

### What about expenses that recur monthly (e.g., rent)?

This patch records one-off expenses only. Recurring expenses need to
be entered each month. A future iteration could add a "Recurring
Expense" feature with auto-duplication on the 1st of each month.

### Does the messages fix work across devices?

Yes — the `message_channel_reads` table is hospital-scoped and synced
via Supabase realtime. If you read a message on your phone, the badge
on your desktop clears within ~20 seconds (the polling interval).
