-- =====================================================================
-- GOODIE-MEDHUB — 059_patient_vitals_consultation_columns.sql
-- =====================================================================
-- ROOT CAUSE FIX for the "consultation history only shows chief complaint"
-- bug reported by the user.
--
-- The DoctorWorkbench consultation form captures 14+ clinical fields
-- (history of presenting illness, past medical/surgical history, drug
-- history, allergies, family/social history, examination findings,
-- clinical notes, treatment plan, follow-up notes, diagnosis, symptoms,
-- diagnoses array) and writes them via useOfflineTable.updateRecord.
--
-- But the patient_vitals table in production has NONE of these columns.
-- useOfflineTable.writeWithSchemaRetry catches the PGRST204 error
-- ("Could not find the 'X' column"), adds the missing column to a
-- session-scoped blocklist, retries the UPDATE without it — and
-- silently discards the data. The user sees a "success" toast but
-- the consultation row only contains the columns that already existed
-- (chief_complaints, status, completed_at, completed_by, observations).
--
-- This migration adds ALL the clinical columns to patient_vitals so the
-- data the doctor types is actually persisted. It is fully additive —
-- no existing columns are dropped or modified.
--
-- Run order: AFTER 058_patient_vitals_alerts.sql
-- Safe to re-run (uses IF NOT EXISTS).
-- =====================================================================

ALTER TABLE public.patient_vitals
  ADD COLUMN IF NOT EXISTS history_presenting_complaint text,
  ADD COLUMN IF NOT EXISTS past_medical_history text,
  ADD COLUMN IF NOT EXISTS past_surgical_history text,
  ADD COLUMN IF NOT EXISTS drug_history text,
  ADD COLUMN IF NOT EXISTS allergy_history text,
  ADD COLUMN IF NOT EXISTS family_social_history text,
  ADD COLUMN IF NOT EXISTS examination_findings text,
  ADD COLUMN IF NOT EXISTS clinical_notes text,
  ADD COLUMN IF NOT EXISTS treatment_plan text,
  ADD COLUMN IF NOT EXISTS follow_up_notes text,
  ADD COLUMN IF NOT EXISTS diagnosis text,
  ADD COLUMN IF NOT EXISTS symptoms jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS diagnoses jsonb DEFAULT '[]'::jsonb;

-- completed_at and completed_by are referenced by DoctorWorkbench.jsx
-- (lines 304-305 of the consultation-complete handler) and by
-- PatientProfile.jsx (the history timeline filter `status === 'completed'`
-- + sort by `completed_at`). They may already exist on some installations
-- (the codebase has been writing them since the dashboard redesign) —
-- IF NOT EXISTS keeps this migration idempotent.
ALTER TABLE public.patient_vitals
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by uuid,
  ADD COLUMN IF NOT EXISTS completed_by_name text;

-- Add an index on (patient_id, completed_at) so the patient history
-- timeline query stays fast as consultations accumulate.
CREATE INDEX IF NOT EXISTS patient_vitals_patient_completed_idx
  ON public.patient_vitals (patient_id, completed_at DESC)
  WHERE completed_at IS NOT NULL;

-- Add an index on status so the "completed encounters" filter is fast.
CREATE INDEX IF NOT EXISTS patient_vitals_status_idx
  ON public.patient_vitals (hospital_id, status)
  WHERE status = 'completed';

-- =====================================================================
-- POST-MIGRATION DATA RECOVERY (informational — no automatic action)
-- =====================================================================
-- The local IndexedDB copy on each doctor's device still has the FULL
-- consultation payload (useOfflineTable merges the update into the local
-- cache BEFORE the network attempt, regardless of whether the server
-- write succeeded). After this migration is applied:
--
--   1. Each doctor just needs to re-open any patient they consulted
--      today — useOfflineTable's background sync will flush the cached
--      full payload up to the now-correctly-schema'd patient_vitals
--      table, and the previously-stripped columns will backfill.
--
--   2. For doctors who have logged out / cleared browser data since
--      the bug started: those consultation fields are permanently lost
--      UNLESS they were captured in the audit_events table. DoctorWorkbench
--      does NOT currently write an audit event for "consultation completed"
--      (only for prescription.finalized, lab_order.sent, etc.) — so for
--      those doctors the historical fields are unrecoverable.
--
-- No automatic backfill is performed by this migration. The fix is
-- forward-looking: every NEW consultation from this point forward will
-- be saved correctly.
-- =====================================================================
