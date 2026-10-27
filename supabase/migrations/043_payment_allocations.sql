-- =====================================================================
-- GOODIE-MEDHUB — 043_payment_allocations.sql
-- One payment can now be split across multiple invoices.
--
-- Before Phase 2: payments table had invoice_id (one invoice per payment)
-- After Phase 2: payments table keeps invoice_id for backwards compat
--                (set to the FIRST invoice the payment was allocated to,
--                 or NULL for an unallocated deposit). New
--                payment_allocations table records the full split.
--
-- A payment with no allocations is an "unallocated deposit" — sits on
-- the patient's account until later allocated to specific invoices.
--
-- Run AFTER 041_invoices_phase2_columns.sql (FK to invoices).
--
-- SAFE TO RE-RUN.
-- =====================================================================

create table if not exists public.payment_allocations (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null references public.hospitals(id) on delete cascade,
  payment_id      uuid not null references public.payments(id) on delete cascade,
  invoice_id      uuid not null references public.invoices(id) on delete cascade,

  amount          numeric(14, 2) not null check (amount > 0),

  -- 'principal' = paying down the invoice balance
  -- 'adjustment' = manual correction (e.g. write-off allocation)
  allocation_type text not null default 'principal'
    check (allocation_type in ('principal','adjustment')),

  -- When this allocation was applied (may differ from payment.created_at
  -- if a deposit sat unallocated for a while before being applied)
  allocated_at    timestamptz not null default now(),
  allocated_by    uuid,
  allocated_by_name text,

  -- Optional note (e.g. "applied to oldest invoice first")
  notes           text,

  created_at      timestamptz not null default now()
);

create index if not exists payment_allocations_payment_idx
  on public.payment_allocations (payment_id);
create index if not exists payment_allocations_invoice_idx
  on public.payment_allocations (invoice_id);
create index if not exists payment_allocations_hospital_idx
  on public.payment_allocations (hospital_id, allocated_at desc);

alter table public.payment_allocations enable row level security;

-- All hospital members can read allocations (financial transparency).
drop policy if exists "payment_allocations_select" on public.payment_allocations;
create policy "payment_allocations_select" on public.payment_allocations
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- Only admin / owner / billing can create / update allocations.
drop policy if exists "payment_allocations_insert" on public.payment_allocations;
create policy "payment_allocations_insert" on public.payment_allocations
  for insert with check (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner', 'billing'),
      false
    )
  );

drop policy if exists "payment_allocations_update" on public.payment_allocations;
create policy "payment_allocations_update" on public.payment_allocations
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

drop policy if exists "payment_allocations_delete" on public.payment_allocations;
create policy "payment_allocations_delete" on public.payment_allocations
  for delete using (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner', 'billing'),
      false
    )
  );

alter table public.payment_allocations replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payment_allocations') then
    alter publication supabase_realtime add table public.payment_allocations;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Backfill: convert existing payment.invoice_id rows into allocations
-- so the new multi-invoice query has consistent data.
-- ---------------------------------------------------------------------
insert into public.payment_allocations (hospital_id, payment_id, invoice_id, amount, allocation_type, allocated_at)
select p.hospital_id, p.id, p.invoice_id, p.amount, 'principal', p.created_at
from public.payments p
where p.invoice_id is not null
  and p.status <> 'reversed'
  and not exists (
    select 1 from public.payment_allocations pa where pa.payment_id = p.id
  );

-- ---------------------------------------------------------------------
-- Verification:
--   select pa.payment_id, i.invoice_number, pa.amount
--     from public.payment_allocations pa
--     join public.invoices i on i.id = pa.invoice_id
--    where pa.hospital_id = '<your-hospital-id>'
--    order by pa.allocated_at desc;
-- ---------------------------------------------------------------------
