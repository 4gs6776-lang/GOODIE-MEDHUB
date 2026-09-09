# SYNC-FIX DELIVERY — 5 Sync Queue Errors Root-Caused & Fixed

Fixes the five failures visible in the "Sync needs attention" panel:
`billable_charges` (duplicate key), `medication_administrations` (null patient_id),
`admission_timeline_events` (missing updated_at column), `invoices` (Failed to fetch),
`admission_requests` (foreign-key violation).

**No migration needed. No new npm packages. Just upload these 4 files over the
existing ones (same paths in your repo), then hard-refresh the PWA (Ctrl+Shift+R).**

## FILE MANIFEST (4 files + README)

| Repo path | What changed |
|-----------|--------------|
| `src/lib/useOfflineTable.js` | The core sync-engine fixes (all 5 errors) — see below |
| `src/pages/dashboard/Laboratory.jsx` | Double-billing guard: re-entering results via Reopen no longer creates a second charge |
| `src/pages/dashboard/Nursing.jsx` | MAR "Give/Mark Administered" now resolves a missing prescription→patient link and refuses cleanly instead of queue-jamming |
| `src/pages/dashboard/Dashboard.jsx` | Sync banner grammar ("2 tables have / 1 table has pending records") |

## WHAT WAS ACTUALLY WRONG (one by one)

1. **billable_charges — duplicate key `unique_source_transaction`**
   The lab bills each test as `LAB-<test id>`. Re-entering results through the
   new Reopen flow created a SECOND charge with the same reference → the
   database (correctly) refuses it → the item jammed the queue forever.
   Fixes: (a) Laboratory no longer creates the duplicate at all; (b) the sync
   engine now *reconciles* any existing duplicate automatically — it looks up
   the already-persisted charge by its unique reference, adopts it, and retires
   the local copy. Your stuck item will clear itself on the next sync.

2. **medication_administrations — null patient_id**
   Some prescriptions (issued before patient_id was saved on the payload, or
   from vitals rows that lacked it) had no patient link. Recording a dose from
   them produced a MAR row with `patient_id: null`, which the database refuses.
   Fix: the nurse station now falls back to matching the patient by name, and
   if no link can be established it shows
   "Cannot record: this prescription has no linked patient" instead of
   silently creating an un-syncable row.
   ⚠ The 2 items already stuck in your queue can never sync (their payload
   really has no patient). Press **Skip** for those two after updating.

3. **admission_timeline_events — missing `updated_at` column**
   Your live table has no `updated_at` column; the app stamps one on every
   write. The engine already strips unknown columns and retries — but items
   that failed with this error were held out of automatic retries forever.
   Fix: once the session has learned the table's missing columns, automatic
   retries resume; the error message now says "Press Retry — the app will
   resend this change without it" (previously it wrongly told you to run a
   schema update — no migration is needed).

4. **invoices — TypeError: Failed to fetch**
   A pure network dropout. Two engine gaps made it look permanent: the queue
   never flushed on app load (only on online/offline events), and there was no
   periodic retry. Fixes: the queue now flushes on load, retries every minute
   while anything is pending, and the raw "TypeError: Failed to fetch" is
   replaced with "The server could not be reached… will be sent automatically
   once the connection is stable." Your stuck invoice will clear itself after
   you deploy + reload.

5. **admission_requests — "still linked to other records… Archive it instead"**
   That message was **misleading** — nothing in the app deletes admission
   requests. What actually happened: the request was saved offline pointing at
   a patient that hadn't reached the server yet, and the queue flushed the
   child *before* the parent (random IndexedDB order) → foreign-key violation.
   Fixes: (a) the flush is now **dependency-ordered** — patients always sync
   before the requests/vitals/invoices that reference them; (b) reference
   failures keep retrying automatically and the message now says the record is
   waiting for its parent to arrive. Your stuck request will sync as soon as
   its patient reaches the server (or shows the accurate reason if it can't).

## HOW TO UPLOAD

```bash
unzip syncfix-delivery.zip -d /tmp/sf
cp -r /tmp/sf/syncfix-delivery/* /path/to/your/repo/
cd /path/to/your/repo
git add -A && git commit -m "Sync engine: root-cause 5 queue jams (ordering, reconciliation, auto-retry)" && git push
```
(or upload the 4 files via GitHub web, same paths)

Then **Ctrl+Shift+R** (PWA cache) and give the queue about a minute —
4 of your 5 stuck items should clear themselves; the 2 null-patient MAR rows
are the only ones that need **Skip**.
