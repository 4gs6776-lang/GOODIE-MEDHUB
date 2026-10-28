-- =====================================================================
-- GOODIE-MEDHUB — 055_patient_folder_expiry.sql
-- Patient folder expiry — category-based durations:
--   - Personal folder:    3 years from registration
--   - Emergency folder:   3 years from registration
--   - Family folder:     10 years from registration
--   - ANC folder:         NEVER expires (NULL)
--   - HMO folder:         NEVER expires (NULL)
--
-- Soft expiry: expired folders stay visible + editable, but show a red
-- "Expired" badge + warning banner. Admin can renew OR patient can
-- register a NEW folder (linked to the old one via previous_folder_id).
--
-- Adds:
--   folder_expires_at        — when the folder expires (NULL = never)
--   folder_renewed_at        — last renewal timestamp
--   folder_renewed_by        — who renewed it
--   folder_renewed_by_name  — name of renewer
--   folder_renewal_count    — how many times renewed
--   previous_folder_id      — if this is a re-registered folder, links
--                              to the old (expired) patient record
--
-- SAFE TO RE-RUN.
-- =====================================================================

alter table public.patients
  add column if not exists folder_expires_at        timestamptz,
  add column if not exists folder_renewed_at        timestamptz,
  add column if not exists folder_renewed_by       uuid,
  add column if not exists folder_renewed_by_name  text,
  add column if not exists folder_renewal_count    integer not null default 0,
  add column if not exists previous_folder_id      uuid;

-- Index for finding expired + soon-to-expire folders
create index if not exists patients_folder_expires_idx
  on public.patients (hospital_id, folder_expires_at);

-- Index for finding re-registered folders linked to an old one
create index if not exists patients_previous_folder_idx
  on public.patients (previous_folder_id)
  where previous_folder_id is not null;

-- ---------------------------------------------------------------------
-- Backfill: set folder_expires_at based on category:
--   personal  → created_at + 3 years
--   emergency → created_at + 3 years
--   family    → created_at + 10 years
--   anc       → NULL (never expires)
--   hmo       → NULL (never expires)
--   NULL/other→ created_at + 3 years (default to personal behaviour)
-- ---------------------------------------------------------------------
update public.patients
   set folder_expires_at = case
     when category = 'family' then created_at + interval '10 years'
     when category in ('anc', 'hmo') then null
     else created_at + interval '3 years'  -- personal, emergency, null, other
   end
 where folder_expires_at is null;

-- ---------------------------------------------------------------------
-- Verification:
--   select category, count(*),
--          count(folder_expires_at) as has_expiry,
--          count(*) - count(folder_expires_at) as never_expires
--     from public.patients
--    where hospital_id = '<your-hospital-id>'
--    group by category;
--
--   -- Should show: personal + emergency have expiry, family has expiry,
--   -- anc + hmo have NULL (never_expires count = total count)
-- ---------------------------------------------------------------------
