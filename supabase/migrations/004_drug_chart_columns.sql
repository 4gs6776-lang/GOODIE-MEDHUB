-- Adds columns the app already reads/writes but that are missing from the
-- live database. Safe to run more than once (IF NOT EXISTS on every line).
--
-- Why this is needed: the app has a "schema-gap tolerance" layer that
-- silently drops any field Postgres rejects, so these were failing
-- quietly (400 Bad Request in the browser console) instead of crashing —
-- but that also means they were never actually being saved.

alter table public.patients
  add column if not exists consultant text;

alter table public.patient_drug_charts
  add column if not exists next_dose text,
  add column if not exists sign text,
  add column if not exists prescription_id uuid;
