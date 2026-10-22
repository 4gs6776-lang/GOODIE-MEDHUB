# GOODIE-MEDHUB — Patient Wallet / Deposit System

A patient deposit/wallet system. Patients can make deposits at Reception (or from their profile). When the cashier generates an invoice, the system auto-deducts from the wallet first — the remainder becomes the invoice's Balance Due. Every wallet movement is recorded in an append-only ledger visible in the new Billing → Transactions tab.

## What it does (plain English)

1. **Patient makes a deposit** — at Reception (inline "+ Deposit" button on the queue) or from the patient profile (new "Wallet" tab). Cash, POS, Bank Transfer, Card, or Other.
2. **Wallet balance shows** on the patient profile + in the cashier workspace (so the cashier knows the patient has funds before generating the invoice).
3. **When the cashier generates an invoice**, the system auto-deducts from the wallet first:
   - If wallet ≥ invoice total → invoice fully paid from wallet, balance = ₦0, wallet keeps the remainder
   - If wallet < invoice total → wallet fully drained, the rest becomes the invoice's Balance Due
4. **Invoice shows "Paid from Wallet: ₦X"** alongside the regular payment breakdown — both on screen and on the printed bill.
5. **Billing → Wallet Transactions tab** — paginated list of every deposit / charge / refund / adjustment across the hospital, with stats (deposits today, charges today, refunds today, total transactions) and filters (by type + free-text search).
6. **Refunds** — admins can issue a refund (reduces the wallet balance, recorded as a separate transaction type with a required reason).
7. **Adjustments** — admins can make manual corrections (positive or negative) with a required reason.
8. **HMO patients bypass the wallet** — their bills go straight to the HMO claim flow as before. The wallet UI shows a clear "Wallet not used" notice on HMO patient profiles.
9. **Wallet can never go negative** — the auto-deduction is capped at the available balance.

## Files in this patch (7 files + 2 migrations + this README)

### New migrations (2)
```
supabase/migrations/
├── 024_patient_wallets.sql              ← patient_wallets + patient_wallet_transactions tables + RLS + trigger
└── 025_invoices_wallet_columns.sql      ← adds wallet_deduction + wallet_id columns to invoices
```

### New file (1)
```
src/components/PatientWallet.jsx         ← balance display + Add Deposit + Refund + Adjust + recent transactions
```

### Modified existing files (5)
```
src/components/PatientProfile.jsx        ← adds 'Wallet' tab (between Overview and History)
src/components/CashierWorkspace.jsx      ← auto-deducts from wallet at invoice generation + shows wallet balance banner
src/components/InvoiceViewer.jsx         ← shows "Paid from Wallet: ₦X" on invoice + printed bill
src/pages/dashboard/Billing.jsx          ← adds "Wallet Transactions" tab with pagination + filters + stats
src/pages/dashboard/Reception.jsx        ← adds inline "+ Deposit" button on the queue + deposit modal
```

## How to deploy (3 steps, ~5 minutes)

### Step 1 — Apply the migrations

Open **Supabase Dashboard → SQL Editor** and run, in order:

1. `supabase/migrations/024_patient_wallets.sql`
2. `supabase/migrations/025_invoices_wallet_columns.sql`

Both are safe to re-run.

### Step 2 — Copy the 6 frontend files over the existing ones

```
src/components/PatientWallet.jsx         ← new
src/components/PatientProfile.jsx        ← modified
src/components/CashierWorkspace.jsx      ← modified
src/components/InvoiceViewer.jsx         ← modified
src/pages/dashboard/Billing.jsx         ← modified
src/pages/dashboard/Reception.jsx        ← modified
```

### Step 3 — Hard-refresh the PWA

`Ctrl+Shift+R` (or `⌘+Shift+R` on macOS)

## How to use it

### Make a deposit (3 ways)

1. **From Reception**: Open Reception → click "+ Deposit" on any patient in the queue → enter amount + method → Save.
2. **From the patient profile**: Open any patient → click the "Wallet" tab → "Add Deposit" → fill in the form → Save.
3. **From Billing** (records only — the deposit modal isn't shown there because there's no specific patient context): open Billing → Wallet Transactions tab → see all transactions across the hospital.

### Generate an invoice that uses the wallet

1. Open Billing → find a patient with pending charges → click "Open Billing"
2. The cashier workspace shows a teal banner at the top: "Wallet balance: ₦20,000. Will auto-deduct up to ₦20,000 from this invoice."
3. Select the charges → click "Generate Invoice"
4. The invoice is created with:
   - `amount_paid = wallet deduction + cashier-collected amount`
   - `wallet_deduction = min(wallet_balance, amount_owed_by_patient)`
   - `balance = amount_owed_by_patient - total_paid`
5. The invoice viewer shows "Paid from Wallet: ₦X" + "Amount Paid (Cash): ₦Y" + "Balance Due: ₦Z"
6. The printed bill shows the same breakdown

### Issue a refund (admins only)

1. Open the patient profile → Wallet tab
2. Click "Refund" (only visible to admin/owner, only when balance > 0)
3. Enter refund amount + method + reason (required)
4. The wallet balance decreases; a "refund" transaction is recorded

### Make a manual adjustment (admins only)

1. Open the patient profile → Wallet tab → "Adjust"
2. Enter a positive or negative amount + reason (required)
3. Used for corrections like duplicate deposits, currency adjustments, etc.

### View all wallet transactions

1. Open **Billing** in the sidebar
2. Click the **"Wallet Transactions"** tab at the top
3. See stats: deposits today, charges today, refunds today, total transactions
4. Filter by type (All / Deposits / Charges / Refunds / Adjustments)
5. Search by patient name, reference, notes, or method
6. Paginated (20 per page, same pattern as every other module)

## How the wallet balance stays accurate

There are two layers of protection:

1. **App layer** — every time a transaction is inserted (deposit, charge, refund, adjustment), the app code computes the new `balance_after` field and includes it in the insert.
2. **Database trigger** — `trg_sync_wallet_balance` fires AFTER INSERT on `patient_wallet_transactions` and updates the `patient_wallets.balance` column to match the latest transaction's `balance_after`. This is the safety net — even if app code somehow drifts, the trigger keeps the balance correct.

The wallet row's `balance` column is therefore always in sync with the latest transaction's `balance_after`. There's no separate "balance update" code path that could drift.

## Build verification

The patched project was test-built with `npm run build` and completed cleanly:
- **0 errors**
- Bundle size: 1438.30 KB (up from 1409 KB baseline — +29 KB total for the wallet UI + transactions tab)
- No new browser dependencies

## Audit trail

Every wallet action writes an `audit_events` row:

| Action | When it fires |
|---|---|
| `wallet.deposit` | Patient makes a deposit (from Reception or patient profile) |
| `wallet.charge` | CashierWorkspace auto-deducts from wallet at invoice generation |
| `wallet.refund` | Admin issues a refund |
| `wallet.adjustment` | Admin makes a manual correction |

All visible in the existing Audit Log page.

## What was NOT changed

- ❌ No existing tables, columns, or RLS policies modified (only additive columns + 2 new tables)
- ❌ No changes to other modules (Pharmacy, Inventory, IPD, Doctor Workbench, etc.)
- ❌ No changes to the existing invoice payment-recording flow (InvoiceViewer's "Record Payment" button still works the same)
- ❌ No new edge functions, no new packages
- ❌ HMO patients still go through the existing HMO claim flow — wallet is bypassed for them

## Important notes

### Existing patients don't have wallets yet

When you deploy this, no patient has a wallet row yet. The first time anyone tries to add a deposit for a patient, the wallet row is created automatically. Existing patients with `hmo_provider` set but `category != 'hmo'` will still be treated as self-pay for wallet purposes (their bills will use the wallet if a deposit has been made).

### Wallet auto-deduction only happens at invoice generation

Per your Q3(a) decision: wallet is touched only when the cashier generates the invoice. Dispensing drugs at the pharmacy does NOT immediately charge the wallet — it creates a pending `billable_charges` row, which gets settled when the cashier generates the invoice later. This matches today's flow exactly.

### HMO patients are skipped entirely

Per your Q6(a) decision: if a patient has `category = 'hmo'` AND has an active HMO provider, the wallet is bypassed. Their bills go through the HMO claim flow as before. The wallet UI on their profile shows: "Wallet not used — this patient is registered as an HMO patient. Their bills go straight to the HMO claim flow."

### Old invoices don't have wallet_deduction

Invoices created BEFORE this patch was deployed have `wallet_deduction = 0` (the column defaults to 0). They display normally — same as today. Only invoices created after the patch is deployed will have wallet deductions.

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| Wallet tab missing on patient profile | You didn't copy the modified `PatientProfile.jsx`. |
| "Add Deposit" button missing on Reception queue | You didn't copy the modified `Reception.jsx`. |
| Wallet Transactions tab missing on Billing | You didn't copy the modified `Billing.jsx`. |
| Invoice doesn't show "Paid from Wallet" | The patient had no wallet balance, OR you didn't copy the modified `InvoiceViewer.jsx`. |
| Migration fails | Run the migrations in order (024 first, then 025). Both are safe to re-run. |
| `permission denied for table patient_wallets` | The RLS policies didn't apply. Re-run migration 024. |
| Build fails | Make sure all 6 files were copied. The most common miss is `PatientWallet.jsx` — without it, `PatientProfile.jsx` will fail to compile. |
| Wallet balance doesn't update after a deposit | The trigger `trg_sync_wallet_balance` didn't get created. Re-run migration 024. Or check the Supabase dashboard → Database → Triggers → verify the trigger exists. |
