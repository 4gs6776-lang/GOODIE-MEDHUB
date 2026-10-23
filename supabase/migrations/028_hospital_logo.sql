-- =====================================================================
-- GOODIE-MEDHUB — 028_hospital_logo.sql
-- Adds a logo_url column to hospitals + creates the hospital-logos
-- storage bucket (public read, authenticated write).
--
-- The logo image is uploaded to Supabase Storage and the public URL
-- is stored in hospitals.logo_url. The app then displays it in:
--   - The sidebar header (Dashboard.jsx)
--   - Printed bills (InvoiceViewer.jsx)
--   - The login page (Login.jsx)
--
-- SAFE TO RE-RUN.
-- =====================================================================

-- 1. Add logo_url column
alter table public.hospitals
  add column if not exists logo_url text;

-- 2. Create the storage bucket (public = anyone can read the URLs)
insert into storage.buckets (id, name, public)
values ('hospital-logos', 'hospital-logos', true)
on conflict (id) do nothing;

-- 3. Storage RLS policies
-- Public read (the bucket is public, but we still need a SELECT policy)
drop policy if exists "hospital_logos_public_read" on storage.objects;
create policy "hospital_logos_public_read" on storage.objects
  for select using (bucket_id = 'hospital-logos');

-- Authenticated users can upload (the app layer checks admin/owner role)
drop policy if exists "hospital_logos_authenticated_upload" on storage.objects;
create policy "hospital_logos_authenticated_upload" on storage.objects
  for insert with check (
    bucket_id = 'hospital-logos'
    and auth.role() = 'authenticated'
  );

-- Authenticated users can update (replace logo)
drop policy if exists "hospital_logos_authenticated_update" on storage.objects;
create policy "hospital_logos_authenticated_update" on storage.objects
  for update using (
    bucket_id = 'hospital-logos'
    and auth.role() = 'authenticated'
  );

-- Authenticated users can delete (when replacing)
drop policy if exists "hospital_logos_authenticated_delete" on storage.objects;
create policy "hospital_logos_authenticated_delete" on storage.objects
  for delete using (
    bucket_id = 'hospital-logos'
    and auth.role() = 'authenticated'
  );

-- ---------------------------------------------------------------------
-- Verification:
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'hospitals'
--      and column_name = 'logo_url';
--   -- should return 1 row
--
--   select id, name, public from storage.buckets where id = 'hospital-logos';
--   -- should return 1 row with public = true
-- ---------------------------------------------------------------------
