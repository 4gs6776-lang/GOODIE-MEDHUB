-- =====================================================================
-- GOODIE-MEDHUB — 008_lab_results_pipeline.sql
-- Laboratory results workflow (Batch 3)
--
-- Adds, WITHOUT changing any existing behaviour:
--   1. Result-workflow columns on lab_orders + lab_tests. The lab
--      pipeline (Ordered → Sample Collected → Processing → Completed →
--      Cancelled) and the shared Lab Result Viewer read/write these.
--      All columns are nullable — existing rows keep working, and the
--      app degrades gracefully if this migration has not run yet
--      (it retries legacy-only writes for those rows).
--   2. Realtime support for BOTH lab tables (replica identity full +
--      supabase_realtime publication), so the Doctor Workbench can
--      surface a completed result the moment the laboratory saves it.
--      Same pattern as 006_handover_realtime.sql.
--
-- NO destructive changes. NO policy changes. SAFE TO RE-RUN.
-- Run in the Supabase SQL editor in one pass.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Result workflow columns
-- ---------------------------------------------------------------------
alter table public.lab_orders
  add column if not exists collected_at    timestamptz,
  add column if not exists collected_by    text,
  add column if not exists resulted_at     timestamptz,
  add column if not exists verified_by     text,
  add column if not exists result_notes    text,
  add column if not exists result_unit     text,
  add column if not exists reference_range text,
  add column if not exists abnormal_flag   text,
  add column if not exists cancelled_at    timestamptz,
  add column if not exists cancel_reason   text;

alter table public.lab_tests
  add column if not exists collected_at    timestamptz,
  add column if not exists collected_by    text,
  add column if not exists resulted_at     timestamptz,
  add column if not exists verified_by     text,
  add column if not exists result_notes    text,
  add column if not exists result_unit     text,
  add column if not exists reference_range text,
  add column if not exists abnormal_flag   text,
  add column if not exists cancelled_at    timestamptz,
  add column if not exists cancel_reason   text;

-- ---------------------------------------------------------------------
-- 2. Realtime: full-row UPDATE/DELETE payloads + publication membership
--    (INSERT events fire without this, but the doctor's "result ready"
--    signal is an UPDATE issued by the laboratory — that requires
--    replica identity full, otherwise the hospital_id filter cannot
--    match and the event is silently dropped).
-- ---------------------------------------------------------------------
alter table public.lab_orders replica identity full;
alter table public.lab_tests  replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lab_orders'
  ) then
    alter publication supabase_realtime add table public.lab_orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lab_tests'
  ) then
    alter publication supabase_realtime add table public.lab_tests;
  end if;
end $$;
