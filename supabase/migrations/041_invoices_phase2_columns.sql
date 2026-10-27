-- =====================================================================
-- GOODIE-MEDHUB — 041_invoices_phase2_columns.sql
-- Adds Phase 2 lifecycle columns to the existing invoices table.
--
-- Phase 1 left invoices as-is (status: paid / partial / unpaid /
-- cancelled). Phase 2 adds:
--   - invoice_type     outpatient | inpatient_interim | inpatient_final | package | credit_note
--   - draft_status    draft | finalized | cancelled | written_off
--                      (separate from the existing `status` column which
--                       tracks PAYMENT state — paid / partial / unpaid)
--   - receipt_number  Separate sequential number for the official receipt
--                      (different from invoice_number). NULL until first
--                      payment is recorded against this invoice.
--   - admission_id    Links inpatient invoices to the IPD admission
--   - approved_by / approved_at / approval_reason  — for discount/write-off approvals
--   - written_off_*   — when an invoice is written off (with reason)
--   - price_list_id   — which tariff was used (Phase 1 catalog linkage)
--   - hmo_contract_id — which contract governed the HMO split
--   - hmo_authorization_code — pre-auth code captured at visit/admission
--   - finalized_at    — when draft → finalized
--
-- SAFE TO RE-RUN: every column uses IF NOT EXISTS.
-- =====================================================================

alter table public.invoices
  add column if not exists invoice_type text not null default 'outpatient'
    check (invoice_type in ('outpatient','inpatient_interim','inpatient_final','package','credit_note')),
  add column if not exists draft_status text not null default 'finalized'
    check (draft_status in ('draft','finalized','cancelled','written_off')),
  add column if not exists receipt_number text,
  add column if not exists admission_id uuid,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists approval_reason text,
  add column if not exists written_off_reason text,
  add column if not exists written_off_by uuid,
  add column if not exists written_off_at timestamptz,
  add column if not exists price_list_id uuid,
  add column if not exists hmo_contract_id uuid,
  add column if not exists hmo_authorization_code text,
  add column if not exists finalized_at timestamptz;

-- Indexes for the new columns
create index if not exists invoices_hospital_draft_idx
  on public.invoices (hospital_id, draft_status, created_at desc);
create index if not exists invoices_hospital_type_idx
  on public.invoices (hospital_id, invoice_type, created_at desc);
create index if not exists invoices_admission_idx
  on public.invoices (admission_id)
  where admission_id is not null;
create index if not exists invoices_receipt_number_idx
  on public.invoices (hospital_id, receipt_number)
  where receipt_number is not null;
create index if not exists invoices_price_list_idx
  on public.invoices (price_list_id)
  where price_list_id is not null;

-- ---------------------------------------------------------------------
-- Backfill: any existing invoice without draft_status gets 'finalized'
-- (they were created by the old Phase 1 code that auto-finalized).
-- This makes the new column behave correctly for old data.
-- ---------------------------------------------------------------------
update public.invoices
   set draft_status = 'finalized'
 where draft_status is null or draft_status = '';

-- ---------------------------------------------------------------------
-- Verification:
--   select column_name, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'invoices'
--      and column_name in ('invoice_type','draft_status','receipt_number',
--                          'admission_id','approved_by','written_off_at',
--                          'price_list_id','hmo_contract_id','hmo_authorization_code');
--   -- should return 9 rows
-- ---------------------------------------------------------------------
