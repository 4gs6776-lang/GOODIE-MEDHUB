-- =====================================================================
-- GOODIE-MEDHUB — 060_patients_hmo_contract_link.sql
-- =====================================================================
-- Section 3 enhancement: proper patient → hmo_contract enrollment link.
--
-- Currently the patient carries `hmo_provider` as free text + a manually-
-- entered `hmo_coverage_percent`. There's no FK to `hmo_contracts`, so
-- the system can't tell which specific contract governs a patient when
-- the hospital has multiple contracts with the same payer (e.g. a
-- "NHIS Standard" and a "NHIS VIP" contract).
--
-- This migration adds the FK column. It's additive — existing rows
-- keep their `hmo_provider` text and `hmo_coverage_percent` number,
-- and CashierWorkspace's `findContractForPatient()` (which does a
-- loose payer_name match) continues to work as a fallback when the
-- FK is null.
--
-- Run AFTER 059_patient_vitals_consultation_columns.sql
-- Safe to re-run (uses IF NOT EXISTS).
-- =====================================================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS hmo_contract_id uuid;

-- Optional: add an index for fast lookup of all patients on a given contract
CREATE INDEX IF NOT EXISTS patients_hmo_contract_id_idx
  ON public.patients (hmo_contract_id)
  WHERE hmo_contract_id IS NOT NULL;

-- =====================================================================
-- Section 4 enhancement: ANC visit tracking table
-- =====================================================================
-- Currently ANC patients are tracked via `patients` columns (anc_lmp,
-- anc_edd, anc_date_of_booking, anc_special_point, anc_indication,
-- anc_husband_name, anc_husband_occupation, anc_employer). These
-- capture the BOOKING visit. Subsequent ANC visits aren't recorded
-- anywhere — there's no table for visit-level notes (BP, weight, fetal
-- heart rate, fundal height, presentation, next-visit plan).
--
-- This migration adds the anc_visits table for per-visit records.
-- It's additive — doesn't touch the existing patients.anc_* columns.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.anc_visits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id     uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  visit_date      date NOT NULL DEFAULT CURRENT_DATE,
  gest_age_weeks  integer,
  bp_systolic     integer,
  bp_diastolic    integer,
  weight_kg       numeric(5,2),
  fundal_height_cm numeric(5,1),
  fetal_heart_rate integer,
  presentation    text,
  urine_protein   text,
  urine_glucose   text,
  edema           text,
  notes           text,
  next_visit_date date,
  performed_by    uuid,
  performed_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS anc_visits_patient_idx
  ON public.anc_visits (patient_id, visit_date DESC);

CREATE INDEX IF NOT EXISTS anc_visits_hospital_idx
  ON public.anc_visits (hospital_id, visit_date DESC);

ALTER TABLE public.anc_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anc_visits_select_own_hospital"
  ON public.anc_visits FOR SELECT
  USING (hospital_id = current_hospital_id());

CREATE POLICY "anc_visits_insert_own_hospital"
  ON public.anc_visits FOR INSERT
  WITH CHECK (hospital_id = current_hospital_id());

CREATE POLICY "anc_visits_update_own_hospital"
  ON public.anc_visits FOR UPDATE
  USING (hospital_id = current_hospital_id());

CREATE POLICY "anc_visits_delete_own_hospital"
  ON public.anc_visits FOR DELETE
  USING (hospital_id = current_hospital_id());
