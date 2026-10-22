-- =====================================================================
-- GOODIE-MEDHUB — 020_add_cmd_role.sql
-- Adds the CMD (Chief Medical Director) role — read-only hospital-wide
--
-- This migration re-runs migration 013's logic so 'cmd' is added to
-- the profiles_role_check constraint. It is fully additive: any
-- existing role stays allowed (the constraint is rebuilt from the
-- UNION of currently-in-use roles + the new fixed list including cmd).
--
-- SAFE TO RE-RUN: drops + recreates the constraint in one transaction.
-- Existing rows are unaffected (their roles are already in the new
-- constraint by construction).
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
      'pharmacist', 'lab', 'billing', 'cmd'
    ])
  ) as roles;

  alter table public.profiles drop constraint if exists profiles_role_check;

  execute format(
    'alter table public.profiles add constraint profiles_role_check check (role in (%s))',
    allowed_roles
  );
end
$$;

-- ---------------------------------------------------------------------
-- Verification (run after to confirm):
--   select pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.profiles'::regclass
--      and conname = 'profiles_role_check';
--   -- should now include 'cmd' in the IN list
-- ---------------------------------------------------------------------
