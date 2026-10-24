-- ===== 029 Part A: protect privileged profile columns =====
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role     text;
  v_caller_hospital uuid;
begin
  -- Trusted server-side callers (edge functions using the service key,
  -- the SQL editor, migrations) have no logged-in user.
  if auth.uid() is null then
    return new;
  end if;

  select role, hospital_id
    into v_caller_role, v_caller_hospital
    from public.profiles
   where id = auth.uid();

  -- The platform owner may do anything.
  if v_caller_role = 'owner' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Profiles can only be created by the platform owner or the staff-creation function.'
      using errcode = '42501';
  end if;

  if new.role is distinct from old.role then
    raise exception 'You cannot change a role.' using errcode = '42501';
  end if;

  if new.hospital_id is distinct from old.hospital_id then
    raise exception 'You cannot change the hospital on a profile.' using errcode = '42501';
  end if;

  -- Activating/deactivating: only an admin of the same hospital.
  if new.active is distinct from old.active then
    if not (v_caller_role = 'admin' and old.hospital_id = v_caller_hospital) then
      raise exception 'Only a hospital admin can activate or deactivate staff.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_columns on public.profiles;
create trigger trg_guard_profile_columns
  before insert or update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();
