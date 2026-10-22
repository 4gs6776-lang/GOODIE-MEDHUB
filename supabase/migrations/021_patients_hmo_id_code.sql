-- =====================================================================
-- GOODIE-MEDHUB — 021_patients_hmo_id_code.sql
-- Adds the hmo_id_code column to the patients table.
--
-- This is the patient's HMO membership ID (the ID code printed on their
-- HMO card). Stored separately from hmo_number (which is the enrollee /
-- policy number assigned by the HMO to the patient's account).
--
-- Additive, safe to re-run (IF NOT EXISTS). No existing columns
-- modified. No RLS policy changes.
-- =====================================================================

alter table public.patients
  add column if not exists hmo_id_code text;

-- Backfill: any existing HMO patient without an hmo_id_code stays NULL.
-- That's fine — the field is optional. Reception will populate it on
-- new registrations and edits.

-- Verification:
--   select column_name, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'patients'
--      and column_name like 'hmo%';
--   -- should now list: hmo_provider, hmo_id_code, hmo_plan, hmo_number, hmo_coverage_percent
