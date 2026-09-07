-- =====================================================================
-- GOODIE-MEDHUB — Stage 1 foundational architecture
-- 007_facilities_audit_foundation.sql
--
-- Adds, WITHOUT changing any existing behaviour:
--   1. `facilities` table (multi-facility groundwork). One hospital can
--      have one facility (auto-created here as the "main" facility) and
--      gains more branches later. Existing screens are untouched — no
--      UI is forced to show a facility selector when there is only one.
--   2. `hospitals.timezone` — configurable hospital timezone used by the
--      centralized date/time utility (defaults to Africa/Lagos, which is
--      what the app already hardcodes today, so display output does not
--      change until the hospital edits the setting).
--   3. `profiles.facility_id` — optional link from a staff member to a
--      facility. NULL means "hospital-wide", which is today's behaviour.
--   4. `audit_events` — append-only audit trail. INSERT + SELECT only:
--      there are deliberately NO update/delete policies, so records
--      cannot be edited or removed through the API.
--
-- SAFE TO RE-RUN: every statement is additive / drop-then-create.
-- Run in the Supabase SQL editor in one pass.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Facilities
-- ---------------------------------------------------------------------
create table if not exists public.facilities (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  name        text not null,
  code        text,
  is_main     boolean not null default false,
  timezone    text,
  address     text,
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One main facility per hospital, at most.
create unique index if not exists facilities_one_main_per_hospital
  on public.facilities (hospital_id)
  where is_main;

create index if not exists facilities_hospital_idx
  on public.facilities (hospital_id);

-- ---------------------------------------------------------------------
-- 2. Hospital timezone (used by the centralized date/time utility)
-- ---------------------------------------------------------------------
alter table public.hospitals
  add column if not exists timezone text;

-- Backfill existing rows with the timezone the app already assumes.
update public.hospitals
set timezone = 'Africa/Lagos'
where timezone is null;

-- ---------------------------------------------------------------------
-- 3. Staff ↔ facility link (optional; NULL = hospital-wide)
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists facility_id uuid references public.facilities(id) on delete set null;

create index if not exists profiles_facility_idx
  on public.profiles (facility_id);

-- ---------------------------------------------------------------------
-- Backfill: one "main" facility for every hospital that has none.
-- Re-running does nothing (guarded by NOT EXISTS).
-- ---------------------------------------------------------------------
insert into public.facilities (hospital_id, name, is_main, active)
select h.id,
       coalesce(h.name, 'Main Facility') || ' — Main',
       true,
       true
from public.hospitals h
where not exists (
  select 1 from public.facilities f where f.hospital_id = h.id
);

-- ---------------------------------------------------------------------
-- Helper functions (mirror the style of 003_rls_policies.sql)
-- ---------------------------------------------------------------------

-- The acting user's own facility. NULL = hospital-wide (today's default).
create or replace function public.current_facility_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$   select facility_id from public.profiles where id = auth.uid()
 $$;

-- The timezone configured for the acting user's hospital.
create or replace function public.current_hospital_timezone()
returns text
language sql
security definer
stable
set search_path = public
as $$   select coalesce(timezone, 'Africa/Lagos')
  from public.hospitals
  where id = public.current_hospital_id()
 $$;

-- ---------------------------------------------------------------------
-- Facilities RLS — same hospital-scoping pattern as every other table
-- ---------------------------------------------------------------------
alter table public.facilities enable row level security;

drop policy if exists "facilities_select" on public.facilities;
create policy "facilities_select" on public.facilities
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "facilities_insert" on public.facilities;
create policy "facilities_insert" on public.facilities
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "facilities_update" on public.facilities;
create policy "facilities_update" on public.facilities
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "facilities_delete" on public.facilities;
create policy "facilities_delete" on public.facilities
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- 4. Audit trail (append-only)
-- ---------------------------------------------------------------------
create table if not exists public.audit_events (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null,
  facility_id uuid,
  actor_id    uuid,
  actor_role  text,
  actor_name  text,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  patient_id  uuid,
  summary     text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_events_hospital_time_idx
  on public.audit_events (hospital_id, created_at desc);

create index if not exists audit_events_entity_idx
  on public.audit_events (entity_type, entity_id);

create index if not exists audit_events_patient_idx
  on public.audit_events (patient_id);

alter table public.audit_events enable row level security;

drop policy if exists "audit_events_select" on public.audit_events;
create policy "audit_events_select" on public.audit_events
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "audit_events_insert" on public.audit_events;
create policy "audit_events_insert" on public.audit_events
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- NOTE: no UPDATE / DELETE policies on purpose — the audit trail is
-- append-only. Rows can never be edited or erased through the API.

-- ---------------------------------------------------------------------
-- Done. Stage 1 does NOT add facility_id to clinical tables — each
-- later stage adds facility scoping to the tables it touches, so no
-- existing screen changes behaviour in this stage.
-- ---------------------------------------------------------------------