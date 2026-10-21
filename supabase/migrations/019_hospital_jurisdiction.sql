-- Adds jurisdiction + clinical-locale config to hospitals.
-- Phase-1 scope is "adult general medicine" only; the columns are added now
-- so the AI edge function can scope its prompt and so future phases can
-- add jurisdiction-specific rules without a schema change.

alter table public.hospitals
  add column if not exists jurisdiction       text,        -- ISO 3166-1 alpha-2, e.g. 'NG', 'US', 'GB'
  add column if not exists clinical_locale    text,        -- e.g. 'en-NG'
  add column if not exists ai_assist_enabled   boolean not null default false;
  -- ^ Default OFF. The hospital admin must explicitly enable AI features
  --   per hospital. This is a kill-switch in case of issues.
