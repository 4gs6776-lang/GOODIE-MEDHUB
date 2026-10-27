-- =====================================================================
-- GOODIE-MEDHUB — 044_deposits.sql
-- Patient deposits / advances — separate from the wallet system.
--
-- Why separate from wallet?
--   - Wallet is a general patient prepayment (any service, any time)
--   - Deposits are specifically tied to admissions / anticipated bills
--   - A deposit can be allocated to a SPECIFIC invoice when the bill
--     is generated (e.g. ₦100k admission deposit → applied to final
--     discharge invoice). Wallet auto-deducts from ANY invoice.
--   - Deposits have a clear lifecycle: pending → allocated → refunded
--
-- Used especially for inpatient admissions — patient pays a deposit
-- before admission; the deposit is allocated against the final bill
-- at discharge. Refunds the unused portion if the deposit exceeded
-- the bill.
--
-- Run AFTER 041_invoices_phase2_columns.sql (FK to invoices).
--
-- SAFE TO RE-RUN.
-- =====================================================================

create table if not exists public.deposits (
  id                  uuid primary key default gen_random_uuid(),
  hospital_id         uuid not null references public.hospitals(id) on delete cascade,
  patient_id          uuid not null references public.patients(id) on delete cascade,
  patient_name        text,
  admission_id        uuid,  -- optional link to IPD admission

  amount              numeric(14, 2) not null check (amount > 0),
  amount_allocated    numeric(14, 2) not null default 0 check (amount_allocated >= 0),
  amount_refunded     numeric(14, 2) not null default 0 check (amount_refunded >= 0),

  -- Method + reference (same pattern as payments)
  method              text not null default 'Cash' check (method in ('Cash','POS','Bank Transfer','Cheque','Wallet','Other')),
  reference_number    text,

  -- 'pending' = received, not yet applied to any invoice
  -- 'partial'  = some amount applied, some remaining
  -- 'allocated' = fully applied to invoices
  -- 'refunded' = remaining balance refunded to patient
  status              text not null default 'pending' check (status in ('pending','partial','allocated','refunded')),

  -- Which invoice(s) the deposit was allocated to (Phase 2 stores
  -- one invoice_id per allocation event — multi-invoice allocation
  -- uses deposit_allocations table in a future phase if needed)
  allocated_invoice_id uuid references public.invoices(id) on delete set null,
  allocated_at         timestamptz,
  allocated_by         uuid,
  allocated_by_name    text,

  -- Refund tracking
  refund_method       text check (refund_method in ('Cash','Bank Transfer','Wallet','Other')),
  refund_reference    text,
  refund_reason       text,
  refunded_at         timestamptz,
  refunded_by         uuid,
  refunded_by_name    text,

  -- Who received the deposit
  received_by         uuid,
  received_by_name    text,
  received_at         timestamptz not null default now(),

  -- Optional note (e.g. "admission deposit for surgery")
  notes               text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists deposits_hospital_patient_idx
  on public.deposits (hospital_id, patient_id, received_at desc);
create index if not exists deposits_admission_idx
  on public.deposits (admission_id)
  where admission_id is not null;
create index if not exists deposits_status_idx
  on public.deposits (hospital_id, status, received_at desc);

alter table public.deposits enable row level security;

-- All hospital members can read deposits.
drop policy if exists "deposits_select" on public.deposits;
create policy "deposits_select" on public.deposits
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- Admin / owner / billing / front_desk can create deposits (front_desk
-- often takes admission deposits at reception).
drop policy if exists "deposits_insert" on public.deposits;
create policy "deposits_insert" on public.deposits
  for insert with check (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner', 'billing', 'front_desk'),
      false
    )
  );

-- Admin / owner / billing can update / allocate / refund.
drop policy if exists "deposits_update" on public.deposits;
create policy "deposits_update" on public.deposits
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

-- No DELETE policy — deposits are append-only / status-based.

drop trigger if exists trg_deposits_updated_at on public.deposits;
create trigger trg_deposits_updated_at
  before update on public.deposits
  for each row execute function public.set_updated_at();

alter table public.deposits replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deposits') then
    alter publication supabase_realtime add table public.deposits;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Verification:
--   select patient_name, amount, amount_allocated, status, received_at
--     from public.deposits
--    where hospital_id = '<your-hospital-id>'
--    order by received_at desc;
-- ---------------------------------------------------------------------
