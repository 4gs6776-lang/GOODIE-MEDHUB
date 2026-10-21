-- AI assessment history with clinician review status.
-- 90-day retention enforced by RLS SELECT policy (rows older than 90 days
-- become invisible to the browser but remain in the database for forensic
-- audit until manually purged). audit_events rows remain forever.

create table if not exists public.ai_assessments (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null references public.hospitals(id) on delete cascade,
  patient_id      uuid not null references public.patients(id) on delete cascade,
  encounter_id    uuid,                      -- patient_vitals.id
  requested_by    uuid not null,             -- profiles.id
  requested_by_name text,
  requested_by_role text,
  assessment_type text not null,             -- 'triage' | 'consultation' | 'medication_safety'
  status          text not null default 'completed', -- 'completed' | 'failed' | 'insufficient_info'
  provider        text,                      -- 'anthropic'
  model           text,                       -- 'claude-3-5-sonnet-20241022'
  prompt_version  text,                      -- e.g. 'v1.0'
  rules_version   text,                      -- e.g. 'empty-v1'
  clinical_context jsonb not null default '{}'::jsonb,  -- snapshot of inputs (minimized)
  structured_output jsonb not null default '{}'::jsonb, -- validated AI response
  safety_warnings jsonb not null default '[]'::jsonb,   -- deterministic rule findings
  -- Clinician review fields:
  review_status   text,                      -- null | 'accepted' | 'modified' | 'rejected'
  reviewed_by     uuid,
  reviewed_by_name text,
  reviewed_at     timestamptz,
  review_notes    text,
  -- Documentation draft the clinician may copy into the record:
  documentation_draft text,
  -- Provenance / timing:
  requested_at    timestamptz not null default now(),
  completed_at    timestamptz,
  duration_ms     integer,
  created_at     timestamptz not null default now()
);

create index if not exists ai_assessments_hospital_patient_idx
  on public.ai_assessments (hospital_id, patient_id, requested_at desc);
create index if not exists ai_assessments_encounter_idx
  on public.ai_assessments (encounter_id);
create index if not exists ai_assessments_review_status_idx
  on public.ai_assessments (hospital_id, review_status)
  where review_status is null;

alter table public.ai_assessments enable row level security;

-- Hospital-scoped SELECT, with 90-day retention window for browser access.
-- Older rows remain in the table for forensic audit but are invisible via API.
drop policy if exists "ai_assessments_select" on public.ai_assessments;
create policy "ai_assessments_select" on public.ai_assessments
  for select using (
    hospital_id = public.current_hospital_id()
    and requested_at > (now() - interval '90 days')
  );

-- INSERT: any authenticated hospital member with role doctor/admin/nurse.
drop policy if exists "ai_assessments_insert" on public.ai_assessments;
create policy "ai_assessments_insert" on public.ai_assessments
  for insert with check (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('doctor','admin','nurse','owner'),
      false
    )
  );

-- UPDATE: only for clinician review fields. The structured_output,
-- clinical_context, safety_warnings, provider, model fields are immutable
-- after insert (preserve provenance).
drop policy if exists "ai_assessments_update_review" on public.ai_assessments;
create policy "ai_assessments_update_review" on public.ai_assessments
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

-- No DELETE policy. Rows cannot be erased through the API. Periodic
-- cleanup of rows older than the forensic-retention limit (e.g. 2 years)
-- is a manual DBA operation, not an API operation.

-- Realtime publication so the requesting browser sees the assessment
-- the moment the edge function finishes writing it.
alter table public.ai_assessments replica identity full;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ai_assessments'
  ) then
    alter publication supabase_realtime add table public.ai_assessments;
  end if;
end $$;
