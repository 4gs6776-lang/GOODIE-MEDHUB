# Phase 2 — Invoice Lifecycle, Multi-Invoice Payments, Credit Notes, Patient Statements

This is **Phase 2 of the Billing Module upgrade**. It builds on Phase 1's master-data foundation to add proper financial workflows:

- **Draft → Finalize invoice lifecycle** (no invoice number consumed until finalize time)
- **Sequential invoice numbers** via the Phase 1 RPC (`INV-000001`, `INV-000002`, …)
- **Separate receipt_number sequence** (`RCT-000001`, `RCT-000002`, …)
- **Multi-invoice payment allocation** (one payment → many invoices)
- **Credit notes** with reason codes + refund methods
- **Write-offs** with required reason
- **Patient Account Statement** tab with printable PDF

Phase 2 takes billing from ~40% → ~60% of the full spec.

---

## Files Delivered

### NEW files (create in your repo)

| File | Purpose |
|------|---------|
| `src/components/CreditNoteModal.jsx` | Modal for issuing a credit note against a finalized invoice |
| `src/components/MultiInvoicePaymentModal.jsx` | Modal for recording one payment split across multiple invoices |
| `supabase/migrations/041_invoices_phase2_columns.sql` | ALTER invoices — adds invoice_type, draft_status, receipt_number, admission_id, written_off_*, etc. |
| `supabase/migrations/042_credit_notes.sql` | credit_notes table |
| `supabase/migrations/043_payment_allocations.sql` | payment_allocations table (one payment → many invoices) |
| `supabase/migrations/044_deposits.sql` | deposits table (separate from wallet — for admission advances) |
| `supabase/migrations/045_billable_charges_catalog_columns.sql` | ALTER billable_charges — adds catalog_code, price_list_id, contract_id |
| `supabase/migrations/046_statement_runs.sql` | statement_runs table (records generated PDF statements) |

### PATCHED files (replace existing)

| File | What changed |
|------|--------------|
| `src/lib/billingService.js` | Added Phase 2 helpers: `useBillingPhase2` hook, `createDraftInvoice`, `finalizeDraftInvoice`, `cancelDraftInvoice`, `writeOffInvoice`, `allocatePaymentAcrossInvoices`, `createCreditNote`, `computePatientStatement`. New constants: `INVOICE_TYPES`, `DRAFT_STATUSES`, `CREDIT_NOTE_REASONS`, `DEPOSIT_STATUSES`. |
| `src/components/CashierWorkspace.jsx` | "Generate Invoice" now uses sequential `invoice_number` + `receipt_number` via the RPC. New "Save as Draft" button (gold) creates draft invoices without consuming a number. Toast notification on draft save. |
| `src/components/PatientProfile.jsx` | New "Statement" tab — shows running ledger (invoices + payments + credit notes) with date range filter + printable PDF. |
| `src/pages/dashboard/Billing.jsx` | Two new tabs: "Drafts" (lists draft invoices + outstanding invoices with Finalize/Cancel/Write-off/Credit Note buttons) and "Credit Notes" (lists all credit notes with search). Includes Multi-Invoice Payment button. |

---

## How to Apply

### Step 1 — Run the 6 migrations IN ORDER

In Supabase SQL Editor, run each file one at a time:

1. `041_invoices_phase2_columns.sql` — adds columns to existing invoices table
2. `042_credit_notes.sql` — creates credit_notes table
3. `043_payment_allocations.sql` — creates payment_allocations table (also backfills existing payment.invoice_id into allocations)
4. `044_deposits.sql` — creates deposits table
5. `045_billable_charges_catalog_columns.sql` — adds catalog linkage columns to billable_charges
6. `046_statement_runs.sql` — creates statement_runs table

**Each is idempotent** — uses `IF NOT EXISTS` / `ON CONFLICT` so re-running is safe.

After all 6 are applied, verify:
```sql
-- Should return 9 columns: invoice_type, draft_status, receipt_number, admission_id,
-- approved_by, written_off_at, price_list_id, hmo_contract_id, hmo_authorization_code
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'invoices'
   and column_name in ('invoice_type','draft_status','receipt_number','admission_id',
                       'approved_by','written_off_at','price_list_id','hmo_contract_id',
                       'hmo_authorization_code');

-- Should return 8 columns on billable_charges
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'billable_charges'
   and column_name in ('catalog_code','service_catalog_id','price_list_id',
                       'hmo_contract_id','coverage_percent','hmo_amount',
                       'patient_amount','hmo_authorization_code');

-- Existing invoices should have draft_status='finalized' (auto-backfilled)
select draft_status, count(*) from public.invoices group by draft_status;
```

### Step 2 — Replace / create the source files

**Create NEW files**:
```
src/components/CreditNoteModal.jsx         ← NEW
src/components/MultiInvoicePaymentModal.jsx  ← NEW
```

**Replace EXISTING files**:
```
src/lib/billingService.js                  ← replace
src/components/CashierWorkspace.jsx        ← replace
src/components/PatientProfile.jsx           ← replace
src/pages/dashboard/Billing.jsx            ← replace
```

### Step 3 — Commit + push to GitHub

Vercel will rebuild. Build verified locally: 2804 modules transformed in 6.84s.

---

## What's New

### 1. Draft → Finalize Invoice Lifecycle

**CashierWorkspace** now has TWO buttons at the bottom:

- **"Save as Draft"** (gold button) — saves the invoice with `draft_status='draft'`. NO invoice number is consumed. The cashier can review later.
- **"Generate Invoice"** (primary button) — saves + finalizes immediately. Assigns sequential `invoice_number` (e.g. `INV-000001`) and `receipt_number` (e.g. `RCT-000001`) via the Phase 1 RPC.

**Drafts do NOT consume invoice numbers** — that only happens at finalize time. So if you create 5 drafts and only finalize 3, your invoice numbers will be `INV-000001`, `INV-000002`, `INV-000003` (no gaps from cancelled drafts).

### 2. Billing → Drafts Tab

A new tab in the Billing module. Shows:

- **Draft invoices** — with "Finalize" and "Cancel" buttons. Finalize assigns the sequential invoice number via the RPC.
- **Outstanding invoices** (finalized, balance > 0) — with "Credit Note" and "Write Off" buttons.
- **Multi-Invoice Payment** button at the top — opens the new multi-invoice payment modal.

### 3. Multi-Invoice Payment Modal

When a patient has multiple outstanding invoices and wants to pay one lump sum:

1. Pick the patient (PatientAutocomplete)
2. Enter total payment amount + method
3. Click "Auto-allocate (oldest first)" → splits the payment across oldest invoices first
4. Manually adjust if needed
5. Confirm → records the payment + creates `payment_allocations` rows + updates each invoice's `amount_paid`, `balance`, `status`

If the payment exceeds total outstanding, the surplus becomes "unallocated" (future Phase 3 will route this to the patient wallet).

### 4. Credit Notes

When an invoice needs to be reversed after finalization (overcharge, service not rendered, HMO short-paid, etc.):

1. Click "Credit Note" on an outstanding invoice
2. Modal opens with invoice summary (total, paid, balance)
3. Enter amount + reason code (8 options: overcharge, service_not_rendered, hmo_short_payment, duplicate_charge, patient_dispute, pricing_error, goodwill, other)
4. Enter reason details (required)
5. Pick refund method:
   - **Reduce invoice balance (none)** — just reduces the balance, no money leaves
   - **Credit patient wallet** — adds credit to wallet for future use
   - **Cash refund** — pays cash back from the drawer
   - **Bank transfer refund** — records a bank transfer refund
6. Confirm → posts the credit note with sequential `CN-000001` number, updates the invoice balance

All credit notes appear in the new **Credit Notes** tab in Billing, with full search.

### 5. Write-offs

On any outstanding invoice, click "Write Off" → enters a reason → invoice marked `draft_status='written_off'` with `written_off_reason`, `written_off_by`, `written_off_at` recorded. Audit event `invoice.written_off` emitted.

### 6. Patient Profile → Statement Tab

A new tab in the patient profile. Shows:

- **Date range filter** (defaults to last 90 days)
- **4 summary cards**: Opening Balance, Total Invoiced, Total Paid, Closing Balance
- **Transaction Ledger table** — every invoice (debit), payment (credit), and credit note in the period, sorted by date
- **Print Statement** button — generates a printable PDF with hospital logo, patient info, period, ledger, and totals

The PDF opens in a new window ready to print or save.

### 7. Billable Charges Catalog Linkage

The `billable_charges` table now has columns for `catalog_code`, `service_catalog_id`, `price_list_id`, `hmo_contract_id`, `coverage_percent`, `hmo_amount`, `patient_amount`, `hmo_authorization_code`. Phase 1 stored this only in audit metadata; Phase 2 promotes it to first-class columns so you can query "show me all charges for service CONS-GEN this month" without digging through audit data.

---

## Audit Trail

New audit actions emitted by Phase 2:

| Action | When |
|--------|------|
| `invoice.draft_created` | Cashier saved an invoice as draft |
| `invoice.finalized` | Draft was finalized (assigned sequential invoice_number) |
| `invoice.cancelled` | Draft was cancelled (only drafts can be cancelled) |
| `invoice.written_off` | Finalized invoice was written off (with reason) |
| `payment.multi_invoice_allocated` | One payment was split across multiple invoices |
| `credit_note.posted` | Credit note was posted against an invoice |

All visible in: Billing → History (module-scoped), Operations → Audit Log (central).

---

## Verification

After deploying, test each feature:

### Draft → Finalize flow

1. Open **Billing** → "Create Invoice" → pick a patient → add some charges via catalog
2. Click **"Save as Draft"** (gold button) → modal closes with toast "Draft invoice saved"
3. Go to **Billing → Drafts tab** → your draft should appear with `DRAFT-XXXXXXXX` number
4. Click **"Finalize"** → invoice gets `INV-000001` (or next sequential number)
5. Verify in Supabase: `select invoice_number, draft_status, finalized_at from public.invoices order by created_at desc limit 5;`

### Multi-Invoice Payment

1. Make sure a patient has at least 2 outstanding (finalized + balance > 0) invoices
2. Open **Billing → Drafts tab** → click **"Multi-Invoice Payment"** button
3. Pick the patient → their outstanding invoices appear
4. Enter total amount (e.g. ₦20,000) → click **"Auto-allocate (oldest first)"**
5. Verify the allocations split correctly across invoices
6. Click **"Record Payment"** → modal closes
7. Verify both invoices' balances updated in the Drafts → Outstanding Invoices table
8. Check Supabase: `select * from public.payment_allocations where payment_id in (select id from public.payments order by created_at desc limit 1);`

### Credit Note

1. Find a finalized invoice with a balance
2. Go to **Drafts tab → Outstanding Invoices** → click **"Credit Note"** on the invoice
3. Enter amount + reason (e.g. "overcharge" + "Patient was overcharged ₦2,000 for consultation")
4. Pick refund method "Reduce invoice balance" → click **"Post Credit Note"**
5. Verify in **Credit Notes tab** → the credit note appears with `CN-000001` number
6. Verify the invoice balance was reduced

### Write-off

1. Find a finalized invoice with a balance
2. Click **"Write Off"** → enter a reason (e.g. "Patient absconded")
3. Verify the invoice `draft_status` changed to `written_off` in Supabase

### Patient Statement

1. Open any patient profile → click the **"Statement"** tab
2. Adjust the date range if needed
3. Verify the 4 summary cards show opening/invoiced/paid/closing balances
4. Verify the ledger shows all transactions in the period
5. Click **"🖨 Print Statement"** → a new window opens with a printable PDF
6. Print or save as PDF from the browser's print dialog

---

## What's NOT in Phase 2 (Coming in Phase 3 + 4)

| Feature | Phase |
|---|---|
| HMO claims lifecycle (Submitted → Queried → Approved → Paid → Rejected) | Phase 3 |
| Capture pre-auth code at visit/admission | Phase 3 |
| Batch claim submission | Phase 3 |
| Claim form PDF (NHIS-style) | Phase 3 |
| Shortfall handling | Phase 3 |
| Approval workflow for discounts/write-offs/refunds above threshold | Phase 4 |
| Recurring expenses with auto-post | Phase 4 |
| 6 financial reports (daily collection, aging, revenue by dept, claims status, patient statements, expense vs revenue) | Phase 4 |
| End-of-day cashier reconciliation | Phase 4 |
| Credit control / aging / service blocking rules | Phase 4 |
| Inpatient interim + final invoices (linked to IPD admissions) | Phase 3+ |

---

## Build Verification

Verified by running `vite build`:
- **2804 modules transformed** (up from 2802 in Phase 1)
- **Build succeeded in 6.84s**
- **Zero syntax errors**
- Bundle: 888 KB main + vendor splits (under the 5 MiB workbox limit)

---

## Rollback

To undo this patch:

1. Revert the source files in your GitHub repo
2. Drop the new tables + columns (optional — leaving them has no effect since old code doesn't reference them):
   ```sql
   drop table if exists public.statement_runs cascade;
   drop table if exists public.payment_allocations cascade;
   drop table if exists public.deposits cascade;
   drop table if exists public.credit_notes cascade;
   alter table public.billable_charges
     drop column if exists catalog_code,
     drop column if exists service_catalog_id,
     drop column if exists price_list_id,
     drop column if exists hmo_contract_id,
     drop column if exists coverage_percent,
     drop column if exists hmo_amount,
     drop column if exists patient_amount,
     drop column if exists hmo_authorization_code;
   alter table public.invoices
     drop column if exists invoice_type,
     drop column if exists draft_status,
     drop column if exists receipt_number,
     drop column if exists admission_id,
     drop column if exists approved_by,
     drop column if exists approved_at,
     drop column if exists approval_reason,
     drop column if exists written_off_reason,
     drop column if exists written_off_by,
     drop column if exists written_off_at,
     drop column if exists price_list_id,
     drop column if exists hmo_contract_id,
     drop column if exists hmo_authorization_code,
     drop column if exists finalized_at;
   ```

---

## What's Next — Phase 3 Preview

Phase 3 will tackle HMO claims lifecycle:

1. ALTER `insurance_claims` with full lifecycle columns (queried_at, approved_at, paid_at, rejected_at, shortfall_amount, clinical_summary JSONB)
2. New `claim_status_history` table (append-only audit of every status change)
3. Capture pre-auth code at Reception / IPD admission
4. Insurance module UI: full lifecycle with status transitions
5. Batch claim submission
6. Claim form PDF generation (NHIS-style)
7. Shortfall handling (patient balance vs write-off vs disputed)

After Phase 3, your billing will be at ~80% of the spec. Phase 4 (reports + approvals + recurring expenses) takes it to 100%.
