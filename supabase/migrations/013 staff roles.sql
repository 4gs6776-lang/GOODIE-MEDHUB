-- =====================================================================
-- 013_staff_roles.sql
--
-- PROBLEM
--   The Add Staff form offers Pharmacist, Laboratory and Billing, and the
--   create-staff function now accepts them, but the database refuses the
--   new profile with:
--     new row for relation "profiles" violates check constraint
--     "profiles_role_check"
--   (the constraint only lists the older roles).
--
-- FIX
--   Recreate profiles_role_check so it allows:
--     owner, admin, doctor, nurse, front_desk, staff,
--     pharmacist, lab, billing
--   PLUS every role that any existing profile already has. The second
--   part is what makes this safe to run without having seen the old
--   definition: if a role is in use today, it stays allowed, so adding
--   the constraint cannot fail on existing rows and nobody loses access.
--
-- SAFE TO RE-RUN: it drops the constraint if it exists, then recreates
-- it from the current data. The whole DO block is one transaction, so it
-- either fully succeeds or changes nothing.
--
-- NULL roles remain allowed (a CHECK never rejects NULL), exactly as
-- before.
-- =====================================================================

do $$
declare
  allowed_roles text;
begin
  select string_agg(quote_literal(r), ', ' order by r)
    into allowed_roles
  from (
    select distinct role::text as r
      from public.profiles
     where role is not null
    union
    select unnest(array[
      'owner', 'admin', 'doctor', 'nurse', 'front_desk', 'staff',
      'pharmacist', 'lab', 'billing'
    ])
  ) as roles;

  alter table public.profiles drop constraint if exists profiles_role_check;

  execute format(
    'alter table public.profiles add constraint profiles_role_check check (role in (%s))',
    allowed_roles
  );
end
$$;

-- Afterwards, this shows the new rule (run it to confirm):
--   select pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.profiles'::regclass
--     and conname = 'profiles_role_check';
