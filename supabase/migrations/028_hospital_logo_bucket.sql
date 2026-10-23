-- =====================================================================
-- GOODIE-MEDHUB — 028_hospital_logo_bucket.sql
-- Creates the hospital-logos storage bucket.
-- Run this SEPARATELY in the Supabase SQL Editor if migration 028
-- failed or wasn't applied. This version is split into individual
-- statements so you can identify which one fails.
-- =====================================================================

-- Step 1: Create the bucket
insert into storage.buckets (id, name, public)
values ('hospital-logos', 'hospital-logos', true)
on conflict (id) do nothing;

-- Step 2: Public read policy (anyone can view the logos)
drop policy if exists "hospital_logos_public_read" on storage.objects;
create policy "hospital_logos_public_read" on storage.objects
  for select using (bucket_id = 'hospital-logos');

-- Step 3: Authenticated upload policy (any logged-in user can upload)
drop policy if exists "hospital_logos_authenticated_upload" on storage.objects;
create policy "hospital_logos_authenticated_upload" on storage.objects
  for insert with check (
    bucket_id = 'hospital-logos'
    and auth.role() = 'authenticated'
  );

-- Step 4: Authenticated update policy (replace logo)
drop policy if exists "hospital_logos_authenticated_update" on storage.objects;
create policy "hospital_logos_authenticated_update" on storage.objects
  for update using (
    bucket_id = 'hospital-logos'
    and auth.role() = 'authenticated'
  );

-- Step 5: Authenticated delete policy (cleanup old logos)
drop policy if exists "hospital_logos_authenticated_delete" on storage.objects;
create policy "hospital_logos_authenticated_delete" on storage.objects
  for delete using (
    bucket_id = 'hospital-logos'
    and auth.role() = 'authenticated'
  );

-- Step 6: Also make sure the logo_url column exists on hospitals
-- (in case migration 028 wasn't fully applied)
alter table public.hospitals
  add column if not exists logo_url text;

-- ---------------------------------------------------------------------
-- Verification:
--   select id, name, public from storage.buckets where id = 'hospital-logos';
--   -- should return 1 row with public = true
--
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'hospitals'
--      and column_name = 'logo_url';
--   -- should return 1 row
-- ---------------------------------------------------------------------
