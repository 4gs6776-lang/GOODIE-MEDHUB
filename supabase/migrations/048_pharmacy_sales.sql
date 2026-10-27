-- =====================================================================
-- GOODIE-MEDHUB — 048_pharmacy_sales.sql
-- Walk-in sales records for the Pharmacy POS feature.
--
-- Each row = one sale (walk-in customer OR a prescription dispense
-- tracked as a sale for revenue reporting).
--
-- Used by:
--   - src/components/pharmacy/WalkInSaleModal.jsx (creates rows)
--   - src/pages/dashboard/Pharmacy.jsx → Sales History tab (reads rows)
--
-- SAFE TO RE-RUN.
-- =====================================================================

create table if not exists public.pharmacy_sales (
  id                uuid primary key default gen_random_uuid(),
  hospital_id       uuid not null references public.hospitals(id) on delete cascade,

  sale_number       text not null,           -- sequential, e.g. SALE-000001
  customer_name     text not null,           -- required (per user spec)
  customer_phone    text,                     -- optional

  -- Items as a JSON array: [{ name, quantity, unit_price, total }]
  items             jsonb not null default '[]'::jsonb,

  -- Totals
  subtotal          numeric(14, 2) not null default 0,
  discount          numeric(14, 2) not null default 0,
  tax               numeric(14, 2) not null default 0,
  total             numeric(14, 2) not null default 0,

  -- Payment
  payment_method    text not null default 'Cash'
    check (payment_method in ('Cash','POS','Bank Transfer','Card','Other')),
  reference_number  text,

  -- Sale type: 'walk_in' for over-the-counter, 'prescription' for
  -- prescription dispenses tracked as sales
  sale_type         text not null default 'walk_in'
    check (sale_type in ('walk_in','prescription')),

  -- Optional links
  patient_id        uuid references public.patients(id) on delete set null,
  prescription_id   uuid references public.prescriptions(id) on delete set null,

  -- Status: completed, refunded, voided
  status            text not null default 'completed'
    check (status in ('completed','refunded','voided')),

  -- Refund tracking (if status = 'refunded')
  refund_reason     text,
  refunded_by       uuid,
  refunded_by_name  text,
  refunded_at       timestamptz,

  -- Provenance — who recorded the sale
  dispensed_by      uuid,
  dispensed_by_name text,

  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (hospital_id, sale_number)
);

create index if not exists pharmacy_sales_hospital_idx
  on public.pharmacy_sales (hospital_id, created_at desc);
create index if not exists pharmacy_sales_type_idx
  on public.pharmacy_sales (hospital_id, sale_type, created_at desc);
create index if not exists pharmacy_sales_status_idx
  on public.pharmacy_sales (hospital_id, status, created_at desc);

alter table public.pharmacy_sales enable row level security;

-- All hospital members can read sales
drop policy if exists "pharmacy_sales_select" on public.pharmacy_sales;
create policy "pharmacy_sales_select" on public.pharmacy_sales
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- Admin / owner / billing / pharmacist can create / update sales
drop policy if exists "pharmacy_sales_insert" on public.pharmacy_sales;
create policy "pharmacy_sales_insert" on public.pharmacy_sales
  for insert with check (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner', 'billing', 'pharmacist'),
      false
    )
  );

drop policy if exists "pharmacy_sales_update" on public.pharmacy_sales;
create policy "pharmacy_sales_update" on public.pharmacy_sales
  for update using (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner', 'billing', 'pharmacist'),
      false
    )
  )
  with check (
    hospital_id = public.current_hospital_id()
  );

-- No DELETE policy — sales are append-only / status-flag-based

drop trigger if exists trg_pharmacy_sales_updated_at on public.pharmacy_sales;
create trigger trg_pharmacy_sales_updated_at
  before update on public.pharmacy_sales
  for each row execute function public.set_updated_at();

alter table public.pharmacy_sales replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pharmacy_sales') then
    alter publication supabase_realtime add table public.pharmacy_sales;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Verification:
--   select sale_number, customer_name, total from public.pharmacy_sales
--    where hospital_id = '<your-hospital-id>' order by created_at desc;
-- ---------------------------------------------------------------------
