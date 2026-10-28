-- =====================================================================
-- GOODIE-MEDHUB — 058_patient_vitals_alerts.sql
-- Early-warning alerts for admitted inpatients based on configured
-- vital-sign limits. NOT a NEWS2/EWS score — just threshold breaches.
--
-- Two tables:
--   1. hospital_vitals_limits — configurable per-hospital thresholds
--   2. patient_vitals_alerts — actual alert rows (created when a
--      saved vital crosses a configured limit)
--
-- SAFE TO RE-RUN.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. hospital_vitals_limits — what thresholds trigger alerts
-- ---------------------------------------------------------------------
-- Each row = one vital + one direction (low or high) + severity.
-- A hospital can have multiple rows per vital (e.g. SpO2 low=92 warning,
-- SpO2 low=88 critical). If no rows exist for a hospital, no alerts
-- are created and the UI shows "early warning not configured."
-- ---------------------------------------------------------------------

create table if not exists public.hospital_vitals_limits (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null references public.hospitals(id) on delete cascade,

  vital_name      text not null check (vital_name in (
    'temperature', 'systolic_bp', 'diastolic_bp', 'pulse_rate',
    'respiratory_rate', 'spo2'
  )),

  direction       text not null check (direction in ('low', 'high')),
  threshold       numeric(10, 2) not null,
  severity        text not null check (severity in ('informational', 'warning', 'critical')),
  label           text,  -- optional custom label e.g. "Severe hypoxemia"

  is_active       boolean not null default true,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (hospital_id, vital_name, direction, threshold)
);

create index if not exists hospital_vitals_limits_hospital_idx
  on public.hospital_vitals_limits (hospital_id, is_active);

alter table public.hospital_vitals_limits enable row level security;

drop policy if exists "hospital_vitals_limits_select" on public.hospital_vitals_limits;
create policy "hospital_vitals_limits_select" on public.hospital_vitals_limits
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "hospital_vitals_limits_insert" on public.hospital_vitals_limits;
create policy "hospital_vitals_limits_insert" on public.hospital_vitals_limits
  for insert with check (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner'),
      false
    )
  );

drop policy if exists "hospital_vitals_limits_update" on public.hospital_vitals_limits;
create policy "hospital_vitals_limits_update" on public.hospital_vitals_limits
  for update using (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner'),
      false
    )
  )
  with check (
    hospital_id = public.current_hospital_id()
  );

drop policy if exists "hospital_vitals_limits_delete" on public.hospital_vitals_limits;
create policy "hospital_vitals_limits_delete" on public.hospital_vitals_limits
  for delete using (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner'),
      false
    )
  );

drop trigger if exists trg_hospital_vitals_limits_updated_at on public.hospital_vitals_limits;
create trigger trg_hospital_vitals_limits_updated_at
  before update on public.hospital_vitals_limits
  for each row execute function public.set_updated_at();

alter table public.hospital_vitals_limits replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hospital_vitals_limits') then
    alter publication supabase_realtime add table public.hospital_vitals_limits;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. patient_vitals_alerts — actual alert rows
-- ---------------------------------------------------------------------
-- Created when a saved vital crosses a configured limit.
-- One alert per (vital, direction) per patient while the previous
-- one is unresolved. A new worse reading creates a new alert.
-- Acknowledged but not auto-resolved — stays in history.
-- ---------------------------------------------------------------------

create table if not exists public.patient_vitals_alerts (
  id                  uuid primary key default gen_random_uuid(),
  hospital_id         uuid not null references public.hospitals(id) on delete cascade,
  patient_id          uuid not null references public.patients(id) on delete cascade,
  patient_name        text,
  vitals_id           uuid,  -- FK to patient_vitals.id (loose — no constraint to survive soft-deletes)
  admission_id        uuid,  -- FK to admissions.id (loose — nullable if no admission)
  bed_id              uuid,  -- FK to beds.id (loose — nullable if not in a bed)
  ward_section        text,  -- 'private' | 'general' | 'icu'

  severity            text not null check (severity in ('informational', 'warning', 'critical')),
  vital_name          text not null,
  vital_value         text not null,    -- the recorded value (string — BP is "120/80")
  vital_unit          text,             -- 'mmHg', 'bpm', '°C', '%', '/min'
  limit_value         numeric(10, 2) not null,  -- the threshold that was crossed
  limit_direction     text not null check (limit_direction in ('low', 'high')),

  -- Previous reading (when available)
  previous_value      text,
  previous_time       timestamptz,

  -- Who recorded the vital that triggered the alert
  recorded_by         uuid,
  recorded_by_name    text,
  recorded_at         timestamptz not null,

  -- Alert lifecycle
  status              text not null default 'active'
    check (status in ('active', 'acknowledged', 'resolved')),

  -- Acknowledgement
  acknowledged_by     uuid,
  acknowledged_by_name text,
  acknowledged_at     timestamptz,
  acknowledgement_note text,

  -- Resolution (manual, does NOT auto-resolve)
  resolved_by         uuid,
  resolved_by_name    text,
  resolved_at         timestamptz,
  resolution_reason   text,

  -- Reason text (human-readable, e.g. "Oxygen 88% at 14:10, limit 92%. Previous 94%.")
  reason              text not null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists patient_vitals_alerts_hospital_patient_idx
  on public.patient_vitals_alerts (hospital_id, patient_id, created_at desc);
create index if not exists patient_vitals_alerts_hospital_status_idx
  on public.patient_vitals_alerts (hospital_id, status, created_at desc);
create index if not exists patient_vitals_alerts_active_idx
  on public.patient_vitals_alerts (hospital_id, status, severity, created_at desc)
  where status in ('active', 'acknowledged');

alter table public.patient_vitals_alerts enable row level security;

-- Nurses and doctors can view alerts for their hospital
drop policy if exists "patient_vitals_alerts_select" on public.patient_vitals_alerts;
create policy "patient_vitals_alerts_select" on public.patient_vitals_alerts
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- Nurses and doctors can acknowledge (update) alerts
drop policy if exists "patient_vitals_alerts_insert" on public.patient_vitals_alerts;
create policy "patient_vitals_alerts_insert" on public.patient_vitals_alerts
  for insert with check (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner', 'doctor', 'nurse'),
      false
    )
  );

drop policy if exists "patient_vitals_alerts_update" on public.patient_vitals_alerts;
create policy "patient_vitals_alerts_update" on public.patient_vitals_alerts
  for update using (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner', 'doctor', 'nurse'),
      false
    )
  )
  with check (
    hospital_id = public.current_hospital_id()
  );

-- No DELETE — alerts are append-only / status-flag-based.

drop trigger if exists trg_patient_vitals_alerts_updated_at on public.patient_vitals_alerts;
create trigger trg_patient_vitals_alerts_updated_at
  before update on public.patient_vitals_alerts
  for each row execute function public.set_updated_at();

alter table public.patient_vitals_alerts replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'patient_vitals_alerts') then
    alter publication supabase_realtime add table public.patient_vitals_alerts;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Verification:
--   select * from public.hospital_vitals_limits
--    where hospital_id = '<your-hospital-id>' and is_active = true;
--   select * from public.patient_vitals_alerts
--    where hospital_id = '<your-hospital-id>' and status in ('active','acknowledged')
--    order by created_at desc;
-- ---------------------------------------------------------------------
