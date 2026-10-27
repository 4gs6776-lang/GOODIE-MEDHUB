-- =====================================================================
-- GOODIE-MEDHUB — 049_insurance_claims_lifecycle.sql
-- Phase 3 — Adds full HMO claim lifecycle to insurance_claims.
--
-- Before Phase 3: claims had status='submitted' and that was it.
-- After Phase 3: full lifecycle
--   submitted → queried → (approved | rejected) → paid (with possible shortfall)
--
-- Adds columns for:
--   - Sequential claim_number (CLM-000001) via the Phase 1 RPC
--   - Link to hmo_contracts (Phase 1 table)
--   - Pre-authorization code captured at visit/admission
--   - clinical_summary JSONB — diagnosis, procedures, drugs, attending
--     physician — included on the NHIS-style claim form PDF
--   - Lifecycle timestamps: queried_at, approved_at, paid_at, rejected_at
--   - Approval + payment tracking (approved_amount, paid_amount)
--   - Shortfall handling (when HMO pays less than approved)
--   - Query response tracking (when HMO queries the claim for more info)
--
-- Run AFTER 036_hmo_contracts.sql + 041_invoices_phase2_columns.sql
-- (claims FK to hmo_contracts; invoices already has hmo_authorization_code
--  from migration 041 which we copy into the claim at file time).
--
-- SAFE TO RE-RUN: every column uses IF NOT EXISTS.
-- =====================================================================

alter table public.insurance_claims
  add column if not exists claim_number          text,
  add column if not exists hmo_contract_id        uuid,
  add column if not exists authorization_code     text,
  add column if not exists authorization_date    timestamptz,
  add column if not exists attending_physician    text,
  add column if not exists clinical_summary       jsonb,
  add column if not exists queried_at             timestamptz,
  add column if not exists queried_by             uuid,
  add column if not exists queried_by_name        text,
  add column if not exists query_reason           text,
  add column if not exists query_response         text,
  add column if not exists approved_at            timestamptz,
  add column if not exists approved_by           uuid,
  add column if not exists approved_by_name       text,
  add column if not exists approved_amount        numeric(14, 2),
  add column if not exists paid_at                timestamptz,
  add column if not exists paid_amount            numeric(14, 2),
  add column if not exists payment_reference      text,
  add column if not exists payment_date           date,
  add column if not exists rejected_at            timestamptz,
  add column if not exists rejected_by           uuid,
  add column if not exists rejected_by_name       text,
  add column if not exists rejection_reason       text,
  add column if not exists rejection_code         text,
  add column if not exists shortfall_amount       numeric(14, 2) not null default 0,
  add column if not exists shortfall_handling     text
    check (shortfall_handling is null or shortfall_handling in ('patient_balance','write_off','disputed')),
  add column if not exists shortfall_handled_at   timestamptz,
  add column if not exists shortfall_handled_by   uuid,
  add column if not exists shortfall_notes        text,
  add column if not exists batch_id               uuid,
  add column if not exists claim_form_pdf_url     text,
  add column if not exists claim_form_generated_at timestamptz;

-- Add a CHECK constraint for the new status values.
-- Existing status was 'submitted'/'approved'/'rejected' (3 values).
-- Phase 3 expands to: submitted, queried, approved, paid, rejected, disputed, cancelled
do $$
begin
  -- Drop the old check if it exists (will fail silently if it doesn't)
  alter table public.insurance_claims drop constraint if exists insurance_claims_status_check;
exception when others then null;
end $$;

alter table public.insurance_claims
  add constraint insurance_claims_status_check
    check (status in ('submitted','queried','approved','paid','rejected','disputed','cancelled'));

-- Indexes for the new columns
create index if not exists insurance_claims_hospital_status_idx
  on public.insurance_claims (hospital_id, status, created_at desc);
create index if not exists insurance_claims_contract_idx
  on public.insurance_claims (hmo_contract_id)
  where hmo_contract_id is not null;
create index if not exists insurance_claims_batch_idx
  on public.insurance_claims (batch_id)
  where batch_id is not null;
create index if not exists insurance_claims_claim_number_idx
  on public.insurance_claims (hospital_id, claim_number)
  where claim_number is not null;
create index if not exists insurance_claims_shortfall_idx
  on public.insurance_claims (hospital_id, shortfall_handling)
  where shortfall_handling is not null;

-- Add unique constraint on claim_number per hospital
do $$
begin
  -- Drop old constraint if exists
  alter table public.insurance_claims drop constraint if exists insurance_claims_claim_number_key;
  -- Add new unique constraint
  alter table public.insurance_claims
    add constraint insurance_claims_claim_number_key unique (hospital_id, claim_number);
exception when others then null;
end $$;

-- ---------------------------------------------------------------------
-- Backfill: existing claims (status='submitted') need a claim_number
-- so the Phase 3 UI can display them properly. We assign sequential
-- numbers using the next_document_number RPC.
-- ---------------------------------------------------------------------
do $$
declare
  v_claim record;
  v_number text;
begin
  for v_claim in
    select id, hospital_id
      from public.insurance_claims
     where claim_number is null
     order by created_at asc
  loop
    v_number := public.next_document_number(v_claim.hospital_id, 'claim', extract(year from now())::int);
    update public.insurance_claims
       set claim_number = v_number
     where id = v_claim.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Verification:
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'insurance_claims'
--      and column_name in ('claim_number','hmo_contract_id','authorization_code',
--                          'clinical_summary','queried_at','approved_at','paid_at',
--                          'rejected_at','shortfall_amount','shortfall_handling');
--   -- should return 10 rows
--
--   select status, count(*) from public.insurance_claims
--    where hospital_id = '<your-hospital-id>' group by status;
--   -- should show 'submitted' count (from before Phase 3)
-- ---------------------------------------------------------------------
