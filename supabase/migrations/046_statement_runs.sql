-- =====================================================================
-- GOODIE-MEDHUB — 046_statement_runs.sql
-- Patient account statement runs — generated PDFs of a patient's
-- financial activity over a date range.
--
-- Each row records the parameters + totals of a generated statement.
-- The PDF itself is stored in Supabase Storage; the URL is on the row.
--
-- Used by PatientProfile → Account Statement tab. Lets the patient
-- (or admin) download a formal statement showing:
--   - Opening balance as of period_from
--   - All invoices generated in the period
--   - All payments recorded in the period
--   - All refunds / credit notes in the period
--   - Closing balance as of period_to
--
-- Run AFTER 041_invoices_phase2_columns.sql (FK to invoices via totals
-- — no direct FK, but statement_runs stores patient_id).
--
-- SAFE TO RE-RUN.
-- =====================================================================

create table if not exists public.statement_runs (
  id                  uuid primary key default gen_random_uuid(),
  hospital_id         uuid not null references public.hospitals(id) on delete cascade,
  patient_id          uuid not null references public.patients(id) on delete cascade,
  patient_name        text,

  statement_number    text not null,  -- sequential, e.g. STMT-000001

  period_from         date not null,
  period_to           date not null,

  -- Totals (for quick display without re-querying)
  opening_balance     numeric(14, 2) not null default 0,
  total_invoiced      numeric(14, 2) not null default 0,
  total_paid          numeric(14, 2) not null default 0,
  total_refunded      numeric(14, 2) not null default 0,
  total_adjusted      numeric(14, 2) not null default 0,
  closing_balance     numeric(14, 2) not null default 0,

  -- Counts of items in the statement
  invoice_count       integer not null default 0,
  payment_count       integer not null default 0,
  credit_note_count   integer not null default 0,

  -- PDF storage
  pdf_url             text,
  pdf_generated_at    timestamptz,
  pdf_generation_error text,  -- if PDF generation failed, the error message

  -- Who generated it
  generated_by        uuid,
  generated_by_name   text,
  generated_at        timestamptz not null default now(),

  -- Optional delivery tracking ( emailed / printed / handed to patient )
  delivery_method     text check (delivery_method in ('printed','emailed','handed','downloaded')),
  delivered_at        timestamptz,

  created_at          timestamptz not null default now(),

  unique (hospital_id, statement_number)
);

create index if not exists statement_runs_hospital_patient_idx
  on public.statement_runs (hospital_id, patient_id, generated_at desc);
create index if not exists statement_runs_hospital_period_idx
  on public.statement_runs (hospital_id, period_from, period_to);

alter table public.statement_runs enable row level security;

-- All hospital members can read statements.
drop policy if exists "statement_runs_select" on public.statement_runs;
create policy "statement_runs_select" on public.statement_runs
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- Admin / owner / billing / front_desk can generate statements.
drop policy if exists "statement_runs_insert" on public.statement_runs;
create policy "statement_runs_insert" on public.statement_runs
  for insert with check (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner', 'billing', 'front_desk'),
      false
    )
  );

-- Admin / owner / billing can update (e.g. attach PDF URL after generation).
drop policy if exists "statement_runs_update" on public.statement_runs;
create policy "statement_runs_update" on public.statement_runs
  for update using (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner', 'billing'),
      false
    )
  )
  with check (
    hospital_id = public.current_hospital_id()
  );

-- Admin / owner can delete (rare — usually kept for audit).
drop policy if exists "statement_runs_delete" on public.statement_runs;
create policy "statement_runs_delete" on public.statement_runs
  for delete using (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner'),
      false
    )
  );

alter table public.statement_runs replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'statement_runs') then
    alter publication supabase_realtime add table public.statement_runs;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Verification:
--   select patient_name, statement_number, period_from, period_to, closing_balance
--     from public.statement_runs
--    where hospital_id = '<your-hospital-id>'
--    order by generated_at desc;
-- ---------------------------------------------------------------------
