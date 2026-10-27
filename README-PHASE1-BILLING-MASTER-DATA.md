# Phase 1 — Billing Master Data Foundation

This is **Phase 1 of the Billing Module upgrade**. It establishes the
master-data foundation that every subsequent phase builds on:

- **Service Catalog** — master list of billable services & items
- **Price Lists / Tariffs** — multiple tariffs with per-service overrides
- **HMO Contracts** — payer contracts with coverage %, pre-auth rules
- **Payment Methods** — configurable dropdowns (cash, POS, transfer, etc.)
- **Expense Vendors** — suppliers, utility companies, contractors
- **Document Sequences** — sequential per-tenant numbering (INV-000001, RCT-000001, etc.)

Migration 040 also seeds ~33 common services and 6 default payment methods
for every existing hospital, so you can start billing immediately.

---

## What's New

### 1. Service Catalog (Settings → Service Catalog)

Master list of billable services. Each row has:
- **Code** (unique per hospital, e.g. `CONS-GEN`, `LAB-FBC`, `BED-PRIVATE`)
- **Name** + description
- **Category** (consultation, lab, procedure, drug, bed, service, anc_package, registration, other)
- **Default price** + default internal cost (for margin reporting later)
- **Unit** (session, test, day, dose, procedure, pack, etc.)
- **Taxable flag** + tax rate
- **Active / Inactive** status (soft-delete — historical invoices still resolve the code)

Migration 040 seeds 33 common services including 4 consultations, 10 lab tests, 4 bed charges, 2 ANC items, 5 procedures, 4 drugs, and 4 registration fees.

### 2. Price Lists (Settings → Price Lists)

Multiple tariffs per hospital. Each price list has a type (standard, HMO, staff, corporate, charity, custom). One price list can be marked as the **default** (used when no patient-specific tariff applies).

For each price list, you can override the price and HMO coverage rules per service:
- **Override Price** — what THIS tariff charges (blank = use catalog default)
- **Coverage %** — what % the HMO covers (e.g. 80 = HMO pays 80%, patient pays 20%)
- **Excluded** — service is excluded from this tariff entirely (e.g. cosmetic procedures in HMO)
- **Pre-Auth Required** — cashier must capture an authorization code

Inline editing — change a cell, click out, it saves automatically.

### 3. HMO Contracts (Settings → HMO Contracts)

Each contract links a payer (HMO, insurance, corporate) to a price list and records:
- **Payer name** + type + contact details
- **Default coverage %** (when no per-service override exists)
- **Pre-auth settings** (phone, email, required flag)
- **Effective dates** + active status
- **Linked price list** — drives all pricing for this contract's patients

### 4. Payment Methods (Settings → Payment Methods)

Replaces the hard-coded `METHODS = ['Cash', 'POS', ...]` array. Each method records:
- **Code** + display label
- **Requires reference number** (POS / transfer / cheque need one)
- **Reconciles to cash drawer** (cash + POS count in daily reconciliation)
- **Sort order** + active status

Migration 040 seeds 6 defaults: cash, POS, transfer, cheque, wallet, HMO.

### 5. Expense Vendors (Settings → Expense Vendors)

Suppliers, utility companies, contractors, etc. Each vendor has:
- **Name** + type (supplier, utility, contractor, staff, government, other)
- **Contact details** (name, phone, email, address)
- **Bank details** (bank name, account name, account number, sort code)
- **Tax ID** + notes + active status

### 6. Document Sequences + `next_document_number()` RPC

Per-hospital sequential numbering. The RPC `public.next_document_number(hospital_id, doc_type, fiscal_year)` is atomic and concurrency-safe — two cashiers finalizing invoices at the same millisecond will still get different numbers.

Format: `INV-000001`, `RCT-000001`, `CLM-000001`, `EXP-000001`, etc.

Phase 2 will call this RPC when invoices are finalized. Phase 1 just makes it available.

---

## CatalogPicker — CashierWorkspace Refactor

The "Add Custom Charge" button in CashierWorkspace now opens a **CatalogPicker** modal instead of using `window.prompt()`. The picker:

1. Lists all active services with search + category filter
2. When the cashier picks a service, the price resolves automatically:
   - HMO patient → uses their HMO contract's price list
   - Self-pay patient → uses the hospital's default price list
   - No price list → uses the catalog's default price
3. Shows the resolved price + HMO split (if HMO patient) + pre-auth warning (if required)
4. Cashier can override the price and quantity before adding
5. Inserts a `billable_charge` with the resolved data + full audit trail

**Backwards compatible** — if the catalog is empty (migration 034 hasn't been applied yet), it falls back to the old `window.prompt()` behavior.

---

## Files Delivered

### NEW files (create in your repo)

| File | Purpose |
|------|---------|
| `src/lib/billingService.js` | Service layer: `useBillingCatalog` hook, `resolvePriceForPatient`, `computeHmoSplit`, `nextDocumentNumber` RPC wrapper, constants |
| `src/components/ServiceCatalogManager.jsx` | CRUD UI for the catalog |
| `src/components/PriceListManager.jsx` | CRUD UI for price lists + inline override editing |
| `src/components/HmoContractManager.jsx` | CRUD UI for HMO contracts |
| `src/components/PaymentMethodManager.jsx` | CRUD UI for payment methods |
| `src/components/ExpenseVendorManager.jsx` | CRUD UI for expense vendors |
| `src/components/CatalogPicker.jsx` | Modal for picking a service + resolving price for the patient |
| `supabase/migrations/034_service_catalog.sql` | Table + RLS + realtime |
| `supabase/migrations/035_price_lists.sql` | Tables + RLS + realtime (price_lists + price_list_items) |
| `supabase/migrations/036_hmo_contracts.sql` | Table + RLS + realtime |
| `supabase/migrations/037_hospital_payment_methods.sql` | Table + RLS + realtime |
| `supabase/migrations/038_expense_vendors.sql` | Table + RLS + realtime |
| `supabase/migrations/039_document_sequences.sql` | Table + `next_document_number()` SECURITY DEFINER RPC |
| `supabase/migrations/040_seed_default_master_data.sql` | Seeds 6 payment methods + 1 default price list + 33 services + price overrides |

### PATCHED files (replace existing)

| File | What changed |
|------|--------------|
| `src/pages/dashboard/Settings.jsx` | Added 5 new sections (Service Catalog, Price Lists, HMO Contracts, Payment Methods, Expense Vendors) — each gated on admin/owner role |
| `src/components/CashierWorkspace.jsx` | "Add Custom Charge" button now opens CatalogPicker; new `handleCatalogPick` handler; backwards-compatible fallback to prompt() when catalog is empty |

---

## How to Apply

### Step 1 — Run the 7 migrations IN ORDER

This is critical — they have FK dependencies.

In your Supabase SQL Editor, run each file one at a time in this order:

1. `034_service_catalog.sql` — creates the catalog table
2. `035_price_lists.sql` — creates price_lists + price_list_items (FK to catalog)
3. `036_hmo_contracts.sql` — creates hmo_contracts (FK to price_lists)
4. `037_hospital_payment_methods.sql` — creates payment methods table
5. `038_expense_vendors.sql` — creates vendors table
6. `039_document_sequences.sql` — creates sequences table + RPC
7. `040_seed_default_master_data.sql` — seeds the defaults (FK to all of the above)

**Each file is idempotent** (uses `IF NOT EXISTS` / `ON CONFLICT`) so you can re-run safely.

After all 7 are applied, verify with:
```sql
-- Should return 6 rows (cash, pos, transfer, cheque, wallet, hmo)
select code, label from public.hospital_payment_methods
 where hospital_id = '<your-hospital-id>' order by sort_order;

-- Should return 1 row (STD Standard Tariff)
select code, name from public.price_lists
 where hospital_id = '<your-hospital-id>';

-- Should return ~33 rows grouped across 8 categories
select category, count(*) from public.service_catalog
 where hospital_id = '<your-hospital-id>' group by category;

-- Should return ~33 rows (one override per service in the STD price list)
select count(*) from public.price_list_items pli
  join public.price_lists pl on pl.id = pli.price_list_id
 where pl.code = 'STD' and pl.hospital_id = '<your-hospital-id>';

-- Test the document number RPC (should return 'INV-000001', then 'INV-000002')
select public.next_document_number('<your-hospital-id>'::uuid, 'invoice', 2026);
```

### Step 2 — Replace / create the source files

Create these NEW files in your repo:

```
src/lib/billingService.js                       ← NEW
src/components/ServiceCatalogManager.jsx         ← NEW
src/components/PriceListManager.jsx              ← NEW
src/components/HmoContractManager.jsx            ← NEW
src/components/PaymentMethodManager.jsx          ← NEW
src/components/ExpenseVendorManager.jsx          ← NEW
src/components/CatalogPicker.jsx                 ← NEW
```

Replace these EXISTING files:

```
src/pages/dashboard/Settings.jsx                ← replace
src/components/CashierWorkspace.jsx             ← replace
```

### Step 3 — Commit + push to GitHub

Vercel will rebuild. The build should succeed (verified: 2802 modules transformed in 6.18s).

---

## Verification

After deploying:

### Service Catalog

1. Open **Settings** → scroll past the Registration Fees panel
2. You should see a new **"Service Catalog"** panel
3. It should show 33 pre-seeded services (4 consultations, 10 labs, 4 bed charges, etc.)
4. Try the search box (e.g. "consultation") and category filter
5. Click "Add Service" → fill in a new one → Save → it should appear in the list
6. Edit an existing one → change the price → Save → verify the change persists
7. Click "Disable" on a service → it should grey out and move to the bottom

### Price Lists

1. Open **Settings → Price Lists**
2. You should see one pre-seeded price list: "Standard Tariff" (STD, default)
3. Click the ▶ next to it to expand → you should see all 33 services with their prices pre-filled
4. Try editing an override price (e.g. change CONS-GEN from ₦5,000 to ₦6,000) → click out → it saves automatically
5. Click "Add Price List" → create an "HMO Tariff" (type=hmo) → Save → it should appear
6. Expand the new HMO tariff → set coverage % to 80 for a few services → they save automatically

### HMO Contracts

1. Open **Settings → HMO Contracts**
2. Click "Add Contract" → enter payer name (e.g. "NHIS"), type=hmo, default coverage=80%, link to your HMO price list → Save
3. The contract should appear in the list
4. Edit it → toggle "Requires Pre-Authorization" → Save → the pre-auth phone/email fields should appear

### Payment Methods

1. Open **Settings → Payment Methods**
2. You should see 6 pre-seeded methods (cash, POS, transfer, cheque, wallet, HMO)
3. Click "Add Method" → create a new one (e.g. code=ussd, label="USSD Transfer", requires_reference=true)
4. Try toggling "Reconciles to Cash Drawer" on transfer → Save

### Expense Vendors

1. Open **Settings → Expense Vendors**
2. Should be empty initially
3. Click "Add Vendor" → fill in (e.g. "PHCN Electricity", type=utility, contact, bank details) → Save
4. Add a few more — suppliers, contractors, etc.
5. Use the search box to filter

### CashierWorkspace — CatalogPicker

1. Open **Billing** → click "Create Invoice" → pick a patient → open the workspace
2. Click the new **"Add Charge from Catalog"** button (top-right of "Automatic Charges")
3. The CatalogPicker modal should open
4. Search for "consultation" → click "General Consultation" → it should resolve the price automatically
5. If the patient is an HMO patient with a contract, you should see the HMO split (HMO covers X%, patient pays Y%)
6. Override the quantity (e.g. 2) → the total should update
7. Click "Add Charge" → the modal closes and the charge appears in the pending list
8. The audit log should record `billing.catalog_charge_added` with full metadata

### Document Sequences RPC

1. In Supabase SQL Editor, run:
   ```sql
   select public.next_document_number('<your-hospital-id>'::uuid, 'invoice', 2026);
   ```
2. First call should return `'INV-000001'`
3. Second call should return `'INV-000002'`
4. Check the `document_sequences` table — it should have one row with `next_value=3`

---

## Audit Trail

New audit actions emitted by Phase 1:

| Action | When |
|--------|------|
| `service_catalog.created` / `.updated` / `.activated` / `.deactivated` | Catalog item changes |
| `price_list.created` / `.updated` / `.deleted` | Price list changes |
| `price_list_item.created` | First-time override for a service in a price list |
| `hmo_contract.created` / `.updated` / `.deleted` | Contract changes |
| `hospital_payment_method.created` / `.updated` / `.deleted` | Payment method changes |
| `expense_vendor.created` / `.updated` / `.deleted` | Vendor changes |
| `billing.catalog_charge_added` | Cashier added a charge via CatalogPicker (replaces `billing.custom_charge_added` for catalog-driven charges) |

All actions are visible in:
- The module's History modal (Billing → History)
- The central Audit Log (Operations → Audit Log)

---

## What's NOT in Phase 1 (Coming in Phase 2)

This is foundational work. The actual invoice lifecycle improvements come next:

- **Draft invoices** (review before finalize) → Phase 2
- **Sequential invoice_number via the RPC** → Phase 2 (CashierWorkspace still uses `INV-${Date.now()}`)
- **Credit notes** → Phase 2
- **Multi-invoice payment allocation** → Phase 2
- **Separate receipt_number sequence** → Phase 2
- **Patient account statement** → Phase 2

Phase 1 just lays the foundation. Every charge now has a catalog code, every price comes from a price list, every hospital can have multiple tariffs, and HMO contracts are properly captured.

---

## Build Verification

This patch was verified by running `vite build`:
- **2802 modules transformed** (up from 2795 — the 7 new files)
- **Build succeeded in 6.18s**
- **Zero syntax errors**
- Bundle size: 2.12 MB (slight increase from new Settings sections)

The only warning is the PWA workbox precache limit (2 MiB) — pre-existing issue, not introduced by this patch.

---

## Rollback

To undo this patch:

1. Revert all source files in your GitHub repo
2. Drop the new tables (optional — leaving them has no effect since nothing references them until Phase 2):
   ```sql
   drop table if exists public.price_list_items cascade;
   drop table if exists public.price_lists cascade;
   drop table if exists public.hmo_contracts cascade;
   drop table if exists public.service_catalog cascade;
   drop table if exists public.hospital_payment_methods cascade;
   drop table if exists public.expense_vendors cascade;
   drop table if exists public.document_sequences cascade;
   drop function if exists public.next_document_number(uuid, text, integer);
   ```

---

## What's Next — Phase 2 Preview

Phase 2 will build on this foundation:

1. **ALTER `invoices`** table to add `invoice_type`, `draft_status`, `approved_by`, `receipt_number`, `admission_id`
2. **New tables**: `credit_notes`, `payment_allocations`, `deposits`
3. **New RPCs**: `finalize_invoice`, `allocate_payment`, `post_credit_note`
4. **CashierWorkspace refactor**: Draft mode (review before finalize), uses `next_document_number` RPC
5. **Multi-invoice payment modal**: one payment → many invoices
6. **Separate receipt_number sequence** (different from invoice_number)
7. **Patient profile: Account Statement tab** — running ledger

After Phase 2 ships, your billing will be at ~60% of the spec. Phases 3 (HMO claims lifecycle) and 4 (approvals + reports) take it to 100%.
