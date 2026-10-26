-- =====================================================================
-- GOODIE-MEDHUB — 031_pharmacy_sales.sql
-- Walk-in pharmacy sales (POS) + prescription tracking
--
-- Creates:
--   1. pharmacy_sales — each completed walk-in sale (with items as JSONB)
--   2. pharmacy_sale_counters — per-hospital counter for sale numbers
--   3. Adds requires_prescription column to inventory_items
--
-- SAFE TO RE-RUN. Additive only. No existing tables modified destructively.
-- =====================================================================

-- 1. pharmacy_sales table
create table if not exists public.pharmacy_sales (
  id                  uuid primary key default gen_random_uuid(),
  hospital_id         uuid not null references public.hospitals(id) on delete cascade,

  -- Unique sale number per hospital (e.g. PS-0001)
  sale_number         text not null,

  -- 'walk_in' = direct retail sale; 'prescription' = dispensed from doctor's order
  sale_type           text not null default 'walk_in' check (sale_type in ('walk_in', 'prescription')),

  -- Customer info (walk-in: free text; prescription: patient name)
  customer_name       text,
  patient_id          uuid references public.patients(id) on delete set null,
  prescription_id     uuid,  -- set when dispensing from a doctor's prescription

  -- Items sold (JSONB array: [{item_id, name, quantity, unit_price, batch_number, expiry_date, total}])
  items               jsonb not null default '[]'::jsonb,

  -- Financials
  subtotal            numeric(14, 2) not null default 0,
  discount            numeric(14, 2) not null default 0,
  total               numeric(14, 2) not null default 0,

  -- Payment
  payment_method      text not null default 'Cash',
  amount_paid          numeric(14, 2) not null default 0,
  balance             numeric(14, 2) not null default 0,

  -- Status: 'completed' | 'refunded' | 'cancelled'
  status              text not null default 'completed' check (status in ('completed', 'refunded', 'cancelled')),

  -- Refund tracking
  refund_reason       text,
  refunded_by         uuid,
  refunded_by_name    text,
  refunded_at         timestamptz,

  -- Staff who completed the sale
  dispensed_by        uuid,
  dispensed_by_name   text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Unique sale number per hospital (prevents duplicate sales)
create unique index if not exists pharmacy_sales_number_unique
  on public.pharmacy_sales (hospital_id, sale_number);

create index if not exists pharmacy_sales_hospital_date_idx
  on public.pharmacy_sales (hospital_id, created_at desc);

create index if not exists pharmacy_sales_type_idx
  on public.pharmacy_sales (hospital_id, sale_type, created_at desc);

create index if not exists pharmacy_sales_status_idx
  on public.pharmacy_sales (hospital_id, status, created_at desc);

-- Auto-stamp updated_at
drop trigger if exists trg_pharmacy_sales_updated_at on public.pharmacy_sales;
create trigger trg_pharmacy_sales_updated_at
  before update on public.pharmacy_sales
  for each row execute function public.set_updated_at();

-- RLS
alter table public.pharmacy_sales enable row level security;

drop policy if exists "pharmacy_sales_select" on public.pharmacy_sales;
create policy "pharmacy_sales_select" on public.pharmacy_sales
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "pharmacy_sales_insert" on public.pharmacy_sales;
create policy "pharmacy_sales_insert" on public.pharmacy_sales
  for insert with check (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('pharmacist', 'admin', 'owner'),
      false
    )
  );

drop policy if exists "pharmacy_sales_update" on public.pharmacy_sales;
create policy "pharmacy_sales_update" on public.pharmacy_sales
  for update using (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner'),
      false
    )
  )
  with check (hospital_id = public.current_hospital_id());

-- No DELETE policy — sales records are immutable.

-- Realtime
alter table public.pharmacy_sales replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pharmacy_sales'
  ) then
    alter publication supabase_realtime add table public.pharmacy_sales;
  end if;
end $$;

-- 2. Per-hospital sale counter (same pattern as mrn_counters)
create table if not exists public.pharmacy_sale_counters (
  hospital_id uuid primary key references public.hospitals(id) on delete cascade,
  next_value  integer not null default 1
);

alter table public.pharmacy_sale_counters enable row level security;

drop policy if exists "pharmacy_sale_counters_select" on public.pharmacy_sale_counters;
create policy "pharmacy_sale_counters_select" on public.pharmacy_sale_counters
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "pharmacy_sale_counters_update" on public.pharmacy_sale_counters;
create policy "pharmacy_sale_counters_update" on public.pharmacy_sale_counters
  for update using (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('pharmacist', 'admin', 'owner'),
      false
    )
  );

-- 3. Add requires_prescription to inventory_items
alter table public.inventory_items
  add column if not exists requires_prescription boolean not null default false;

-- ---------------------------------------------------------------------
-- Verification:
--   select table_name from information_schema.tables
--    where table_schema = 'public' and table_name like 'pharmacy_sale%';
--   -- should return: pharmacy_sales, pharmacy_sale_counters
--
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'inventory_items'
--      and column_name = 'requires_prescription';
--   -- should return 1 row
-- ---------------------------------------------------------------------
