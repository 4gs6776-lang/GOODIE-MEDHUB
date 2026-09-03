-- =====================================================================
-- GOODIE-MEDHUB — Shift Handover module
-- Adds shift_handovers / handover_patients / handover_tasks, scoped to
-- the existing hospital_id tenant model, plus RLS policies that follow
-- the exact same pattern as 003_rls_policies.sql (current_hospital_id()
-- / is_owner()). No new tables duplicate existing functionality —
-- patients, admissions, beds, patient_vitals, lab_tests,
-- radiology_scans and patient_drug_charts are referenced, not copied.
-- Safe to re-run: every statement drops-then-creates or uses IF NOT EXISTS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper functions (re-declared here with CREATE OR REPLACE so this
-- migration is safe to run standalone even before 003_rls_policies.sql)
-- ---------------------------------------------------------------------

create or replace function public.current_hospital_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select hospital_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) = 'owner',
    false
  )
$$;

-- ---------------------------------------------------------------------
-- shift_handovers
-- One row per ward + shift + date handover session.
-- ---------------------------------------------------------------------
create table if not exists public.shift_handovers (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  ward text not null,
  shift_type text not null check (shift_type in ('M','N')),
  handover_date date not null default current_date,
  prepared_by uuid references public.profiles(id),
  prepared_by_name text,
  template_key text,
  status text not null default 'draft' check (status in ('draft','submitted','acknowledged','archived')),
  general_notes text,
  medication_notes text,
  investigation_notes text,
  incident_notes text,
  incidents jsonb not null default '[]'::jsonb,
  submitted_at timestamptz,
  acknowledged_by uuid references public.profiles(id),
  acknowledged_by_name text,
  acknowledged_at timestamptz,
  receiving_shift text,
  archived_by uuid references public.profiles(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shift_handovers_hospital on public.shift_handovers(hospital_id);
create index if not exists idx_shift_handovers_ward on public.shift_handovers(hospital_id, ward);
create index if not exists idx_shift_handovers_date on public.shift_handovers(hospital_id, handover_date desc);
create index if not exists idx_shift_handovers_status on public.shift_handovers(hospital_id, status);

-- ---------------------------------------------------------------------
-- handover_patients
-- One row per patient included in a given handover. Links to the
-- existing patients / admissions tables instead of copying their data.
-- ---------------------------------------------------------------------
create table if not exists public.handover_patients (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  handover_id uuid not null references public.shift_handovers(id) on delete cascade,
  patient_id uuid references public.patients(id),
  patient_name text,
  bed_label text,
  admission_id uuid references public.admissions(id),
  priority text not null default 'low' check (priority in ('low','medium','high','critical')),
  situation text,
  background text,
  assessment text,
  recommendation text,
  medication_notes text,
  investigation_notes text,
  specialty_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_handover_patients_hospital on public.handover_patients(hospital_id);
create index if not exists idx_handover_patients_handover on public.handover_patients(handover_id);
create index if not exists idx_handover_patients_patient on public.handover_patients(patient_id);

-- ---------------------------------------------------------------------
-- handover_tasks
-- Pending clinical tasks raised during a handover. If the project later
-- adds a general task/order system, this can be pointed at it instead.
-- ---------------------------------------------------------------------
create table if not exists public.handover_tasks (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  handover_id uuid not null references public.shift_handovers(id) on delete cascade,
  patient_id uuid references public.patients(id),
  patient_name text,
  description text not null,
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  due_at timestamptz,
  assigned_role text,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','cancelled')),
  completed_by uuid references public.profiles(id),
  completed_by_name text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_handover_tasks_hospital on public.handover_tasks(hospital_id);
create index if not exists idx_handover_tasks_handover on public.handover_tasks(handover_id);
create index if not exists idx_handover_tasks_status on public.handover_tasks(hospital_id, status);

-- ---------------------------------------------------------------------
-- updated_at triggers (matches the "stamp updated_at on write" pattern
-- the offline sync layer already expects from every table)
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_shift_handovers_updated_at on public.shift_handovers;
create trigger trg_shift_handovers_updated_at
  before update on public.shift_handovers
  for each row execute function public.set_updated_at();

drop trigger if exists trg_handover_patients_updated_at on public.handover_patients;
create trigger trg_handover_patients_updated_at
  before update on public.handover_patients
  for each row execute function public.set_updated_at();

drop trigger if exists trg_handover_tasks_updated_at on public.handover_tasks;
create trigger trg_handover_tasks_updated_at
  before update on public.handover_tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS — shift_handovers
-- Hard delete is intentionally NOT allowed except for owner: clinical
-- handovers must be archived (status = 'archived'), never deleted.
-- ---------------------------------------------------------------------
alter table public.shift_handovers enable row level security;

drop policy if exists "shift_handovers_select" on public.shift_handovers;
create policy "shift_handovers_select" on public.shift_handovers
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "shift_handovers_insert" on public.shift_handovers;
create policy "shift_handovers_insert" on public.shift_handovers
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "shift_handovers_update" on public.shift_handovers;
create policy "shift_handovers_update" on public.shift_handovers
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "shift_handovers_delete" on public.shift_handovers;
create policy "shift_handovers_delete" on public.shift_handovers
  for delete using (
    public.is_owner()
  );

-- ---------------------------------------------------------------------
-- RLS — handover_patients
-- ---------------------------------------------------------------------
alter table public.handover_patients enable row level security;

drop policy if exists "handover_patients_select" on public.handover_patients;
create policy "handover_patients_select" on public.handover_patients
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "handover_patients_insert" on public.handover_patients;
create policy "handover_patients_insert" on public.handover_patients
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "handover_patients_update" on public.handover_patients;
create policy "handover_patients_update" on public.handover_patients
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "handover_patients_delete" on public.handover_patients;
create policy "handover_patients_delete" on public.handover_patients
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- RLS — handover_tasks
-- ---------------------------------------------------------------------
alter table public.handover_tasks enable row level security;

drop policy if exists "handover_tasks_select" on public.handover_tasks;
create policy "handover_tasks_select" on public.handover_tasks
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "handover_tasks_insert" on public.handover_tasks;
create policy "handover_tasks_insert" on public.handover_tasks
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "handover_tasks_update" on public.handover_tasks;
create policy "handover_tasks_update" on public.handover_tasks
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "handover_tasks_delete" on public.handover_tasks;
create policy "handover_tasks_delete" on public.handover_tasks
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );
