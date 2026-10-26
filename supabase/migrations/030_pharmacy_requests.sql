-- 030: Pharmacy requests (staff ask the pharmacy for part of a prescription)
-- Adds ONE new table. No existing table is changed.
--
-- Each row = "this staff member asked for N of this drug for this patient".
-- The doctor's prescription keeps its original quantity; the amount still
-- available is worked out by the app (prescribed minus non-cancelled requests),
-- so there is no counter that can drift out of step.

create table if not exists public.pharmacy_requests (
  id                 uuid primary key default gen_random_uuid(),
  hospital_id        uuid not null references public.hospitals(id) on delete cascade,
  patient_id         uuid not null references public.patients(id) on delete cascade,
  patient_name       text,
  prescription_id    uuid references public.prescriptions(id) on delete set null,
  drug_name          text not null,
  quantity           integer not null check (quantity > 0),
  notes              text,
  not_prescribed     boolean not null default false,   -- drug was not on an active prescription
  exceeds_remaining  boolean not null default false,   -- asked for more than was left
  status             text not null default 'requested'
                     check (status in ('requested', 'dispensed', 'cancelled')),
  requested_by       uuid references public.profiles(id) on delete set null,
  requested_by_name  text,
  requested_by_role  text,
  dispensed_quantity integer check (dispensed_quantity is null or dispensed_quantity > 0),
  dispensed_by       uuid references public.profiles(id) on delete set null,
  dispensed_by_name  text,
  dispensed_at       timestamptz,
  cancelled_by_name  text,
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists pharmacy_requests_hospital_idx     on public.pharmacy_requests (hospital_id);
create index if not exists pharmacy_requests_patient_idx      on public.pharmacy_requests (patient_id);
create index if not exists pharmacy_requests_prescription_idx on public.pharmacy_requests (prescription_id);
create index if not exists pharmacy_requests_status_idx       on public.pharmacy_requests (hospital_id, status);

drop trigger if exists trg_pharmacy_requests_updated_at on public.pharmacy_requests;
create trigger trg_pharmacy_requests_updated_at
  before update on public.pharmacy_requests
  for each row execute function public.set_updated_at();

-- Row Level Security: same rule as prescriptions (own hospital, or platform owner).
-- There is deliberately no DELETE policy: requests are cancelled, never erased.
alter table public.pharmacy_requests enable row level security;

drop policy if exists pharmacy_requests_select on public.pharmacy_requests;
create policy pharmacy_requests_select on public.pharmacy_requests
  for select to authenticated
  using (hospital_id = current_hospital_id() or is_owner());

drop policy if exists pharmacy_requests_insert on public.pharmacy_requests;
create policy pharmacy_requests_insert on public.pharmacy_requests
  for insert to authenticated
  with check (hospital_id = current_hospital_id() or is_owner());

drop policy if exists pharmacy_requests_update on public.pharmacy_requests;
create policy pharmacy_requests_update on public.pharmacy_requests
  for update to authenticated
  using (hospital_id = current_hospital_id() or is_owner())
  with check (hospital_id = current_hospital_id() or is_owner());

-- Live alert for the pharmacist when a request arrives.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pharmacy_requests') then
    alter publication supabase_realtime add table public.pharmacy_requests;
  end if;
end $$;
