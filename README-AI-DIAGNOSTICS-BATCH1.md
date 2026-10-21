# Batch 1 — Database Setup for AI Diagnostics

This is the **first batch** of the AI-Assisted Diagnostics module. It contains ONLY the two SQL migration files. No code, no UI changes, no edge function yet.

## What this batch does

It adds ONE new table to your Supabase database (`ai_assessments`) and THREE new columns to your existing `hospitals` table. Nothing existing is changed.

## Files in this batch (2 SQL files + this README)

```
supabase/migrations/
├── 018_ai_assessments.sql        ← creates the ai_assessments table
└── 019_hospital_jurisdiction.sql ← adds 3 columns to hospitals
```

---

## What is `ai_assessments`?

Every time a doctor clicks "AI Assist" on a patient, the AI returns a structured report (differential diagnoses, recommended tests, safety concerns, etc.). That report gets saved as a row in the `ai_assessments` table.

Each row stores:

- **Who asked for it**: `requested_by`, `requested_by_name`, `requested_by_role`
- **Which patient**: `patient_id`, `encounter_id` (the patient_vitals row)
- **What the AI returned**: `structured_output` (JSON), `documentation_draft` (text the doctor can copy)
- **Safety warnings**: any red flags the deterministic rules engine caught
- **Provider provenance**: which AI provider, which model, which prompt version, which rules version — so a clinician reviewing an old assessment knows exactly what produced it
- **Clinician review**: `review_status` (NULL → 'accepted' → 'modified' → 'rejected'), `reviewed_by`, `reviewed_at`, `review_notes`

### Privacy controls baked in

- **Hospital-scoped** via Row-Level Security — same pattern as every other clinical table in your app. Hospital A cannot see Hospital B's AI assessments.
- **Role-scoped**: only doctors/admins/owners/nurses can insert; only doctors/admins/owners can update.
- **No DELETE policy** — rows can never be erased through the API.
- **90-day retention window** on SELECT — rows older than 90 days become invisible from the browser but remain in the database for forensic audit. (Permanent audit events still go to `audit_events`, which has no expiry.)

## What are the 3 new columns on `hospitals`?

| Column | Type | Default | Purpose |
|---|---|---|---|
| `jurisdiction` | text | NULL | ISO country code (e.g. `'NG'`). The AI uses this to scope clinical guidance to the right country's guidelines. NULL = "general international guidance". |
| `clinical_locale` | text | NULL | BCP-47 locale (e.g. `'en-NG'`). Used to choose units (SI vs US), date formats, and language. |
| `ai_assist_enabled` | boolean | **false** | **The kill switch.** Even after the AI feature is fully deployed, it will refuse to run for any hospital where this is `false`. The hospital admin must explicitly opt in. |

The default is `false` on purpose. Even when the code is shipped and the edge function is live, no hospital gets AI features automatically.

---

## How to deploy this batch

1. Open your **Supabase dashboard**.
2. Go to **SQL Editor**.
3. Copy the contents of `018_ai_assessments.sql` and click **Run**.
4. Copy the contents of `019_hospital_jurisdiction.sql` and click **Run**.

Both migrations are **safe to re-run** — every statement uses `IF NOT EXISTS`, so running them twice does nothing the second time.

### Verification queries (run these in the SQL Editor after applying the migrations)

```sql
-- Should show 0 rows (the table is now there, just empty):
select count(*) from public.ai_assessments;

-- Should show your hospital with ai_assist_enabled = false:
select id, name, jurisdiction, clinical_locale, ai_assist_enabled
  from public.hospitals;

-- Should show the three RLS policies:
select polname, polcmd
  from pg_policy
 where polrelid = 'public.ai_assessments'::regclass;
-- Expected output:
--   ai_assessments_select | r   (SELECT)
--   ai_assessments_insert | a   (INSERT)
--   ai_assessments_update | w   (UPDATE)
```

### Do NOT enable AI for your hospital yet

Do **not** run `update hospitals set ai_assist_enabled = true` until the entire feature is built and tested. I'll tell you when.

---

## What this batch does NOT do

- ❌ No new code in your React app
- ❌ No new edge function
- ❌ No AI calls
- ❌ No UI changes
- ❌ No new dependencies
- ❌ No modifications to existing tables, columns, or RLS policies
- ❌ No changes to `permissions.js`, `subscriptionLock.js`, `useOfflineTable.js`

Those all come in later batches.

---

## What's coming next

**Batch 2** — frontend library helpers (3 files):
- `src/lib/aiAssist.js` — calls the edge function
- `src/lib/clinicalSafetyRules.js` — the deterministic rules engine (empty for now)
- `src/lib/clinicalContextBuilder.js` — assembles the patient context to send to the AI

**Reply "continue"** to proceed to Batch 2.

If anything in this batch looks wrong, tell me what to fix before moving on.
