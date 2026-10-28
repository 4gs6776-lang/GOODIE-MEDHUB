-- =====================================================================
-- GOODIE-MEDHUB — 051_patients_hmo_authorization.sql
-- Phase 3 — Adds per-visit pre-authorization capture columns to
-- patients table.
--
-- When an HMO patient visits, the receptionist captures the
-- pre-authorization code from the HMO (some HMOs require this before
-- certain services can be billed). This code is then copied onto
-- every invoice generated for that visit, and onto the HMO claim.
--
-- The columns are NULL by default — only HMO patients with HMO
-- contracts requiring pre-auth (hmo_contracts.requires_pre_auth = true)
-- will populate them.
--
-- Run AFTER 036_hmo_contracts.sql.
--
-- SAFE TO RE-RUN.
-- =====================================================================

alter table public.patients
  add column if not exists hmo_authorization_code      text,
  add column if not exists hmo_authorization_date      timestamptz,
  add column if not exists hmo_authorization_expires   date,
  add column if not exists hmo_authorization_captured_by uuid,
  add column if not exists hmo_authorization_captured_at timestamptz,
  add column if not exists hmo_authorization_notes     text;

-- Index for finding HMO patients with valid auth codes
create index if not exists patients_hmo_auth_idx
  on public.patients (hospital_id, hmo_authorization_code)
  where hmo_authorization_code is not null;

-- ---------------------------------------------------------------------
-- Verification:
--   select full_name, hmo_provider, hmo_authorization_code, hmo_authorization_date
--     from public.patients
--    where hospital_id = '<your-hospital-id>'
--      and hmo_authorization_code is not null;
-- ---------------------------------------------------------------------
