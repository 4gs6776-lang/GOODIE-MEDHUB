-- =====================================================================
-- GOODIE-MEDHUB — 045_billable_charges_catalog_columns.sql
-- Adds catalog linkage columns to the existing billable_charges table.
--
-- Phase 1 stored catalog_code only in audit_events metadata (couldn't
-- ALTER billable_charges without breaking the existing flow). Phase 2
-- promotes the catalog linkage to first-class columns on the row itself.
--
-- Now you can query: "show me all charges for service CONS-GEN this
-- month" without digging through audit metadata.
--
-- SAFE TO RE-RUN: every column uses IF NOT EXISTS.
-- =====================================================================

alter table public.billable_charges
  add column if not exists catalog_code    text,            -- FK by code to service_catalog.code (loose — no FK constraint to avoid breaking old rows)
  add column if not exists service_catalog_id uuid,         -- FK by id to service_catalog.id (loose — old rows have NULL)
  add column if not exists price_list_id    uuid,           -- which tariff resolved the price
  add column if not exists hmo_contract_id  uuid,           -- which contract governed the HMO split
  add column if not exists coverage_percent numeric(5, 2) default 0,  -- what % HMO covered (0 = self-pay)
  add column if not exists hmo_amount       numeric(14, 2) default 0, -- how much HMO will be billed
  add column if not exists patient_amount   numeric(14, 2) default 0, -- how much patient owes
  add column if not exists hmo_authorization_code text;     -- pre-auth code (if required by the contract)

-- Indexes for the new columns
create index if not exists billable_charges_catalog_code_idx
  on public.billable_charges (hospital_id, catalog_code)
  where catalog_code is not null;
create index if not exists billable_charges_price_list_idx
  on public.billable_charges (price_list_id)
  where price_list_id is not null;
create index if not exists billable_charges_hmo_contract_idx
  on public.billable_charges (hmo_contract_id)
  where hmo_contract_id is not null;

-- ---------------------------------------------------------------------
-- Verification:
--   select column_name, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'billable_charges'
--      and column_name in ('catalog_code','service_catalog_id','price_list_id',
--                          'hmo_contract_id','coverage_percent','hmo_amount',
--                          'patient_amount','hmo_authorization_code');
--   -- should return 8 rows
-- ---------------------------------------------------------------------
