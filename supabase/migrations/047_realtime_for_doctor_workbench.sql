-- =====================================================================
-- GOODIE-MEDHUB — 047_realtime_for_doctor_workbench.sql
-- Adds patient_vitals, prescriptions, and patients to the Supabase
-- realtime publication so the DoctorWorkbench auto-refreshes when:
--   - Nurse records new vitals (INSERT on patient_vitals)
--   - Nurse updates vitals / sends patient to doctor (UPDATE on patient_vitals)
--   - Patient queue_status changes (UPDATE on patients)
--   - Prescriptions are added/updated (INSERT/UPDATE on prescriptions)
--
-- Without this migration, the realtime subscriptions in DoctorWorkbench
-- silently fail — doctors had to F5 to see newly-triaged patients.
--
-- SAFE TO RE-RUN.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Set replica identity FULL on all tables we want UPDATE events for.
--    Without this, UPDATE payloads only include the changed columns —
--    not the full row. Our realtime handlers need patient_id, status,
--    queue_status, etc., which means we need the full row.
-- ---------------------------------------------------------------------

alter table public.patient_vitals replica identity full;
alter table public.prescriptions replica identity full;
alter table public.patients replica identity full;

-- ---------------------------------------------------------------------
-- 2. Add each table to the supabase_realtime publication (idempotent).
--    This makes Postgres broadcast INSERT/UPDATE/DELETE events to all
--    subscribed clients (filtered by hospital_id in the app's RLS).
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'patient_vitals') then
    alter publication supabase_realtime add table public.patient_vitals;
  end if;
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'prescriptions') then
    alter publication supabase_realtime add table public.prescriptions;
  end if;
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'patients') then
    alter publication supabase_realtime add table public.patients;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Verification:
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime'
--      and schemaname = 'public'
--      and tablename in ('patient_vitals','prescriptions','patients');
--   -- should return 3 rows
-- ---------------------------------------------------------------------
