-- =====================================================================
-- GOODIE-MEDHUB — 018_ai_assessments.sql
-- AI-Assisted Diagnostics — assessment history with clinician review
--
-- Adds ONE new table: ai_assessments. Adds NO columns to any existing
-- table. Drops nothing. Modifies nothing about any existing table.
--
-- This is the table that stores the AI's structured assessment output
-- (after the doctor has clicked "Generate Assessment"), plus the
-- clinician's review status (accepted / modified / rejected) once the
-- doctor acts on it.
--
-- Retention: rows newer than 90 days are visible via the API; older
-- rows stay in the database for forensic audit but are invisible from
-- the browser. (audit_events rows remain forever — those are the
-- permanent audit trail; ai_assessments is the working clinical
-- record with a shorter shelf life, per the user's Q5(a) choice.)
--
-- SAFE TO RE-RUN: every statement uses IF NOT EXISTS. Existing tables
-- and policies are never dropped or modified.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The ai_assessments table
-- ---------------------------------------------------------------------
create table if not exists public.ai_assessments (
  id                  uuid primary key default gen_random_uuid(),

  -- Tenant scoping (matches every other clinical table in this app)
  hospital_id         uuid not null references public.hospitals(id) on delete cascade,

  -- Patient + encounter references
  patient_id          uuid not null references public.patients(id) on delete cascade,
  encounter_id        uuid,                          -- patient_vitals.id (nullable so the
                                                     -- column survives if the vitals row is
                                                     -- later soft-deleted)

  -- Who requested the assessment
  requested_by        uuid not null,                 -- profiles.id
  requested_by_name   text,
  requested_by_role   text,

  -- What kind of assessment: 'triage' (nurse-initiated) | 'consultation' (doctor)
  assessment_type     text not null,

  -- Status of the AI call itself
  -- 'completed' = AI returned a valid structured response
  -- 'failed' = provider error, validation error, timeout, etc.
  -- 'insufficient_info' = AI deliberately returned "I don't have enough
  --                       information to make a meaningful assessment"
  -- 'out_of_scope' = AI declined because the presentation is outside
  --                   Phase-1 scope (pediatric, obstetric, etc.)
  status              text not null default 'completed',

  -- Provider + model provenance (so a clinician reviewing a year-old
  -- assessment knows which model produced it)
  provider            text,                          -- 'anthropic'
  model               text,                          -- 'claude-3-5-sonnet-20241022'
  prompt_version      text,                          -- 'v1.0'
  rules_version       text,                          -- 'empty-v1' (deterministic rules engine)

  -- The actual content of the assessment
  clinical_context    jsonb not null default '{}'::jsonb,   -- snapshot of inputs (minimized, no PII)
  structured_output   jsonb not null default '{}'::jsonb,   -- validated AI response
  safety_warnings     jsonb not null default '[]'::jsonb,  -- deterministic rule findings
  documentation_draft text,                                    -- editable draft the clinician can copy

  -- Failure details (only populated when status = 'failed')
  error_kind          text,                          -- 'provider_timeout' | 'invalid_output' | 'rate_limited' | 'provider_error'
  error_message       text,

  -- Clinician review fields (NULL until the clinician acts)
  review_status       text,                          -- NULL | 'accepted' | 'modified' | 'rejected'
  reviewed_by         uuid,                          -- profiles.id
  reviewed_by_name   text,
  reviewed_at         timestamptz,
  review_notes       text,

  -- Timing / provenance
  requested_at        timestamptz not null default now(),
  completed_at        timestamptz,
  duration_ms         integer,                       -- how long the AI call took
  created_at          timestamptz not null default now()
);

-- Indexes that match the actual access patterns
create index if not exists ai_assessments_hospital_patient_idx
  on public.ai_assessments (hospital_id, patient_id, requested_at desc);

create index if not exists ai_assessments_encounter_idx
  on public.ai_assessments (encounter_id);

create index if not exists ai_assessments_review_pending_idx
  on public.ai_assessments (hospital_id, requested_at desc)
  where review_status is null and status = 'completed';

-- ---------------------------------------------------------------------
-- 2. Row-Level Security
--
-- Same pattern as every other clinical table in this app:
--   - hospital-scoped (current_hospital_id() from migration 007)
--   - INSERT restricted to doctor / admin / nurse / owner
--   - UPDATE restricted to doctor / admin / owner (the review action)
--   - No DELETE policy (rows can never be erased through the API)
--   - SELECT applies the 90-day retention window
-- ---------------------------------------------------------------------
alter table public.ai_assessments enable row level security;

-- SELECT: hospital-scoped, 90-day retention window.
-- Older rows remain in the table for forensic audit (DBA can query them
-- directly with a service-role client) but are invisible via the API.
drop policy if exists "ai_assessments_select" on public.ai_assessments;
create policy "ai_assessments_select" on public.ai_assessments
  for select using (
    hospital_id = public.current_hospital_id()
    and requested_at > (now() - interval '90 days')
  );

-- INSERT: only doctors, admins, owners, and nurses can create an
-- assessment row. (Nurses can request triage assessments; doctors
-- must still approve any documentation that gets saved to the patient
-- record — that approval is enforced at the application layer, not
-- at the database layer, because the database cannot tell which
-- clinician role is "allowed to save documentation" without complex
-- per-column RLS.)
drop policy if exists "ai_assessments_insert" on public.ai_assessments;
create policy "ai_assessments_insert" on public.ai_assessments
  for insert with check (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('doctor','admin','nurse','owner'),
      false
    )
  );

-- UPDATE: only doctors / admins / owners can update an assessment row,
-- and only the review_* fields should be touched. The structured_output,
-- clinical_context, safety_warnings, provider, model fields are
-- effectively immutable after insert — the application layer enforces
-- this; the RLS policy enforces "only authorized roles can update at
-- all". (Postgres column-level privileges would be the stronger
-- enforcement, but the existing app does not use them anywhere and
-- introducing them only here would be inconsistent.)
drop policy if exists "ai_assessments_update" on public.ai_assessments;
create policy "ai_assessments_update" on public.ai_assessments
  for update using (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('doctor','admin','owner'),
      false
    )
  )
  with check (
    hospital_id = public.current_hospital_id()
  );

-- DELIBERATELY NO DELETE POLICY.
-- Rows cannot be erased through the API. Cleanup of rows older than the
-- forensic-retention limit (e.g. 2 years) is a manual DBA operation.

-- ---------------------------------------------------------------------
-- 3. Realtime publication
--
-- So the requesting browser sees the assessment the moment the edge
-- function finishes writing it (no polling). Same pattern as
-- 006_handover_realtime.sql and 008_lab_results_pipeline.sql.
-- ---------------------------------------------------------------------
alter table public.ai_assessments replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ai_assessments'
  ) then
    alter publication supabase_realtime add table public.ai_assessments;
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- Done. To verify:
--   select count(*) from public.ai_assessments;   -- should return 0
--   select polname, polcmd, qual::text, with_check::text
--     from pg_policy where polrelid = 'public.ai_assessments'::regclass;
--   -- should show: ai_assessments_select (r), ai_assessments_insert (a),
--   --               ai_assessments_update (w)
-- ---------------------------------------------------------------------
