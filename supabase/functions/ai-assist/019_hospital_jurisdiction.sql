-- =====================================================================
-- GOODIE-MEDHUB — 019_hospital_jurisdiction.sql
-- AI-Assisted Diagnostics — hospital-level config + kill switch
--
-- Adds THREE columns to the existing `hospitals` table. Modifies no
-- existing columns. Drops nothing. Safe to re-run.
--
-- Why each column:
--
--   jurisdiction       — ISO country code (e.g. 'NG', 'US', 'GB').
--                        The AI prompt uses this to scope clinical
--                        guidance to the right country's guidelines.
--                        Defaults to NULL; if NULL, the AI operates in
--                        "general international guidance" mode.
--
--   clinical_locale    — BCP-47 locale tag (e.g. 'en-NG', 'en-US').
--                        Used by the AI to choose units (SI vs US),
--                        date formats, and language. Defaults to NULL.
--
--   ai_assist_enabled  — Boolean, defaults to FALSE. This is the
--                        hospital-level kill switch. Even if the AI
--                        feature is deployed and the edge function
--                        is running, AI features will refuse to
--                        execute for any hospital where this is
--                        false. The hospital admin must explicitly
--                        opt in.
-- =====================================================================

alter table public.hospitals
  add column if not exists jurisdiction       text,
  add column if not exists clinical_locale    text,
  add column if not exists ai_assist_enabled  boolean not null default false;

-- ---------------------------------------------------------------------
-- Backfill: hospitals that already exist get NULL jurisdiction/locale
-- (the AI treats NULL as "general international guidance") and
-- ai_assist_enabled = false (explicit opt-in required).
-- No UPDATE needed — the column defaults handle this.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Done. To verify:
--   select id, name, jurisdiction, clinical_locale, ai_assist_enabled
--     from public.hospitals;
--
-- To enable AI for a hospital (run after the edge function is deployed):
--   update public.hospitals
--      set ai_assist_enabled = true,
--          jurisdiction = 'NG',          -- your country code
--          clinical_locale = 'en-NG'     -- your locale
--    where id = '<your-hospital-id>';
-- ---------------------------------------------------------------------
