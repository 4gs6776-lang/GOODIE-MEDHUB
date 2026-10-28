-- =====================================================================
-- GOODIE-MEDHUB — 054_credit_control_rules.sql
-- Phase 4 — Configurable credit control rules per hospital.
--
-- Each hospital can configure rules like:
--   "Block new services if patient has outstanding balance > ₦50,000
--    AND oldest unpaid invoice is > 60 days old"
--
-- The Reception / Doctor Workbench / Pharmacy modules will call the
-- credit control evaluation helper (in billingService.js) and surface
-- a warning banner OR block the action based on the rule.
--
-- SAFE TO RE-RUN.
-- =====================================================================

create table if not exists public.hospital_credit_control_rules (
  id                uuid primary key default gen_random_uuid(),
  hospital_id       uuid not null references public.hospitals(id) on delete cascade,

  name              text not null,
  description       text,

  -- Thresholds
  -- Block services if patient has outstanding balance > this amount
  outstanding_balance_threshold  numeric(14, 2) not null default 50000,
  -- AND oldest unpaid invoice is older than this many days
  oldest_invoice_age_days        integer not null default 60,

  -- What to do when rule triggers
  action            text not null default 'warn'
    check (action in ('warn', 'block', 'block_with_override')),

  -- Who can override a block (only meaningful if action='block_with_override')
  override_roles    text[] not null default '{admin,owner}',

  -- Apply rule to all patients OR only specific categories
  applies_to_all    boolean not null default true,
  applies_to_categories text[] not null default '{}'::text[],  -- ['outpatient','inpatient','hmo','anc']

  is_active         boolean not null default true,

  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists hospital_credit_control_rules_hospital_idx
  on public.hospital_credit_control_rules (hospital_id, is_active);

alter table public.hospital_credit_control_rules enable row level security;

drop policy if exists "hospital_credit_control_rules_select" on public.hospital_credit_control_rules;
create policy "hospital_credit_control_rules_select" on public.hospital_credit_control_rules
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "hospital_credit_control_rules_insert" on public.hospital_credit_control_rules;
create policy "hospital_credit_control_rules_insert" on public.hospital_credit_control_rules
  for insert with check (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner'),
      false
    )
  );

drop policy if exists "hospital_credit_control_rules_update" on public.hospital_credit_control_rules;
create policy "hospital_credit_control_rules_update" on public.hospital_credit_control_rules
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

drop policy if exists "hospital_credit_control_rules_delete" on public.hospital_credit_control_rules;
create policy "hospital_credit_control_rules_delete" on public.hospital_credit_control_rules
  for delete using (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner'),
      false
    )
  );

drop trigger if exists trg_hospital_credit_control_rules_updated_at on public.hospital_credit_control_rules;
create trigger trg_hospital_credit_control_rules_updated_at
  before update on public.hospital_credit_control_rules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Per-patient credit blocks (manual overrides or system-imposed)
-- When a patient has an active block, Reception / Doctor Workbench /
-- Pharmacy modules will display a "Patient is on credit hold" banner
-- and may prevent new services from being added (depending on the
-- configured action).
-- ---------------------------------------------------------------------

create table if not exists public.patient_credit_blocks (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null references public.hospitals(id) on delete cascade,
  patient_id      uuid not null references public.patients(id) on delete cascade,

  -- Manual or auto-generated (auto when triggered by a rule)
  source          text not null default 'manual'
    check (source in ('manual', 'rule_trigger', 'admin_override')),

  reason          text not null,
  blocked_by      uuid,
  blocked_by_name text,
  blocked_at      timestamptz not null default now(),

  -- Optional expiry — NULL = indefinite until manually lifted
  expires_at      timestamptz,

  -- Lift info (when the block was removed)
  lifted_at       timestamptz,
  lifted_by       uuid,
  lifted_by_name  text,
  lift_reason     text,

  -- Status: 'active' (blocked) or 'lifted' (no longer blocking)
  status          text not null default 'active'
    check (status in ('active', 'lifted')),

  -- Optional link to the rule that triggered this block
  rule_id         uuid references public.hospital_credit_control_rules(id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists patient_credit_blocks_hospital_patient_idx
  on public.patient_credit_blocks (hospital_id, patient_id, status);
create index if not exists patient_credit_blocks_active_idx
  on public.patient_credit_blocks (hospital_id, status, blocked_at desc)
  where status = 'active';

alter table public.patient_credit_blocks enable row level security;

drop policy if exists "patient_credit_blocks_select" on public.patient_credit_blocks;
create policy "patient_credit_blocks_select" on public.patient_credit_blocks
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "patient_credit_blocks_insert" on public.patient_credit_blocks;
create policy "patient_credit_blocks_insert" on public.patient_credit_blocks
  for insert with check (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner', 'billing', 'front_desk'),
      false
    )
  );

drop policy if exists "patient_credit_blocks_update" on public.patient_credit_blocks;
create policy "patient_credit_blocks_update" on public.patient_credit_blocks
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

drop policy if exists "patient_credit_blocks_delete" on public.patient_credit_blocks;
create policy "patient_credit_blocks_delete" on public.patient_credit_blocks
  for delete using (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner'),
      false
    )
  );

drop trigger if exists trg_patient_credit_blocks_updated_at on public.patient_credit_blocks;
create trigger trg_patient_credit_blocks_updated_at
  before update on public.patient_credit_blocks
  for each row execute function public.set_updated_at();

alter table public.patient_credit_blocks replica identity full;
alter table public.hospital_credit_control_rules replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'patient_credit_blocks') then
    alter publication supabase_realtime add table public.patient_credit_blocks;
  end if;
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hospital_credit_control_rules') then
    alter publication supabase_realtime add table public.hospital_credit_control_rules;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Verification:
--   select * from public.hospital_credit_control_rules
--    where hospital_id = '<your-hospital-id>' and is_active = true;
--   select * from public.patient_credit_blocks
--    where hospital_id = '<your-hospital-id>' and status = 'active';
-- ---------------------------------------------------------------------
