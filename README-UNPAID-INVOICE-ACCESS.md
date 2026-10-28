# Unpaid Invoice Access Fix

## Problem
If the cashier clicked **Generate Invoice** by mistake without entering an amount, the invoice was created with `status='unpaid'` and the patient's charges moved from `pending` → `invoiced`. The patient then **disappeared from the patient queue** (which only shows patients with `pending` charges), and the unpaid invoice was buried under **Drafts tab → Outstanding Invoices sub-section** — which only had **Credit Note** and **Write Off** buttons. There was no obvious way to come back and **record a payment** on that invoice.

In the user's words: *"it keep showing awaiting bill without been able to access it again"*.

## Fix (two layers)

### 1. New "Unpaid Invoices" tab in the Cashier Dashboard (`Billing.jsx`)
- Added a dedicated **Unpaid Invoices** tab between **Patient Queue** and **Drafts**
- Shows every finalized invoice with `balance > 0` (status `unpaid` or `partial`)
- Includes a search box and pagination
- Each row has 4 actions:
  - **Take Payment** — opens the `InvoiceViewer` modal where the cashier can record a payment against the balance (with wallet-first deduction if applicable)
  - **View** — opens the `InvoiceViewer` to print the receipt without recording a payment
  - **Credit Note** — issue a credit note (same as before)
  - **Write Off** — mark as bad debt (same as before)
- The **Outstanding Invoices KPI card** is now clickable — clicking it switches to the Unpaid Invoices tab and shows the count of unpaid invoices
- A red badge on the tab itself shows the count of unpaid invoices, so the cashier is always aware of pending work
- The old Outstanding Invoices sub-section that was buried under the Drafts tab has been replaced with a slim pointer banner

### 2. Confirmation dialog when generating an unpaid invoice (`CashierWorkspace.jsx`)
- When the cashier clicks **Generate Invoice** with no amount entered AND the patient has no wallet to auto-deduct from, a `confirm()` dialog appears:
  > *"No payment amount entered. The invoice will be created as UNPAID with a balance of ₦X. You can record a payment on it later from: Billing → Unpaid Invoices tab → Take Payment. Click OK to create the unpaid invoice, or Cancel to go back and enter an amount."*
- This makes the mistake **impossible to make silently** — but doesn't block legitimate cases (split-billing, pay-later, post-dated cheque)
- The same dialog shows for HMO patients when no amount was entered for the patient portion

## Files changed

| File | Lines changed | Purpose |
|------|---------------|---------|
| `src/pages/dashboard/Billing.jsx` | +250 / -75 | New "Unpaid" tab + KPI card click + InvoiceViewer modal render + Drafts tab simplification |
| `src/components/CashierWorkspace.jsx` | +30 / -2 | `confirm()` dialog before generating an unpaid invoice |

## Apply steps

1. **Copy the two patched files over your existing source:**
   ```bash
   # from the unzipped patch folder
   cp src/pages/dashboard/Billing.jsx        <project>/src/pages/dashboard/Billing.jsx
   cp src/components/CashierWorkspace.jsx     <project>/src/components/CashierWorkspace.jsx
   ```

2. **No new dependencies, no migrations, no Supabase changes.** This is a pure UI patch — it reuses the existing `InvoiceViewer` component (which already supports recording payments) and the existing `useOfflineTable` `invoices` hook.

3. **Commit + push to GitHub** — Vercel will auto-deploy.

4. **Verify in production:**
   - Open the Billing dashboard → confirm the new **Unpaid Invoices** tab is visible (between Patient Queue and Drafts)
   - If you have any existing unpaid invoices, they should appear immediately with a red badge on the tab showing the count
   - Click **Take Payment** on a row → `InvoiceViewer` opens with the **Record Payment** button → record a payment → invoice moves to `paid` or `partial`
   - Click the red **Outstanding Invoices** KPI card → switches to the Unpaid tab automatically

## Verification
- ✅ `npx vite build` succeeds — 2814 modules transformed in 6.88s, zero errors
- ✅ No new dependencies, no Supabase migration, no RPC required
- ✅ Backwards compatible — old unpaid invoices (created before this patch) automatically show on the new tab; no data migration needed

## After this fix
The user's exact scenario now works like this:
1. Cashier clicks **Generate Invoice** without entering an amount → confirmation dialog appears
2. If they click **OK** (intentional), the invoice is created as unpaid
3. The patient leaves the queue (correct behaviour)
4. The cashier (or anyone with billing access) goes to **Billing → Unpaid Invoices tab** → sees the invoice immediately, with a red badge showing the unpaid count
5. Clicks **Take Payment** → `InvoiceViewer` opens → enters the amount → clicks **Save Payment** → invoice is now `paid` (or `partial` if they entered less than the balance)
6. The KPI stat card at the top updates in real-time to reflect the new outstanding balance
