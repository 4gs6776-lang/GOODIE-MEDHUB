-- =====================================================================
-- 014_server_side_subscription_rules.sql
--
-- WHY
--   Until now the "expired / suspended = read-only" lock and the plan
--   limits only existed INSIDE the app. Anyone who talked to the
--   database directly could ignore them. This migration makes the
--   DATABASE enforce the same rules, so they cannot be bypassed.
--
-- WHAT IT ADDS (nothing existing is changed or deleted)
--   1. enforce_subscription_lock()  — one trigger function. When a
--      hospital's subscription status is 'expired' or 'suspended', it
--      refuses INSERT / UPDATE / DELETE on the clinical and financial
--      tables listed below. It mirrors the app's rules exactly:
--        * medication charting, vitals, messages, notifications,
--          the audit log, subscriptions and subscription payments are
--          NOT touched (a locked hospital must still be able to pay,
--          chart doses and record vitals);
--        * on `prescriptions` only status / administered_at /
--          administered_by may still change, and on `patients` only
--          queue_status / queue_updated_at (so dose charting and the
--          triage queue keep working);
--        * reading is never affected.
--   2. enforce_plan_patient_limit() — refuses a NEW patient once the
--      hospital's plan max_patients is reached. Re-saving an existing
--      patient is never counted as a new one.
--   3. enforce_plan_staff_reactivate() — refuses re-activating a staff
--      account when the plan's max_staff is already used (or the
--      hospital is locked). Deactivating is always allowed. (Creating
--      NEW staff is checked inside the create-staff function.)
--
-- WHO IS NEVER BLOCKED
--   * the platform owner (is_owner()),
--   * server-side work with no signed-in user (edge functions using the
--     service role, the daily subscription job, migrations).
--
-- SAFETY DESIGN
--   * FAIL-OPEN: if anything inside a check goes wrong (unexpected
--     column, bad data), the write is ALLOWED. A bug here must never stop
--     real clinical work. Only a clear "locked" or "limit reached"
--     answer blocks a write.
--   * A hospital with no subscription row, or an unknown plan, is never
--     blocked.
--   * Cheap: one lookup of a single subscriptions row per write.
--   * Fully reversible: run 014_rollback.sql to remove everything this
--     file adds.
--   * Safe to re-run.
--
-- KNOWN BEHAVIOUR TO EXPECT
--   Records a device saved OFFLINE before the hospital expired will be
--   refused by the server when they sync AFTER expiry. They show as
--   "Sync failed" and sync normally once the subscription is renewed
--   (then use retry in the app).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Subscription lock
-- ---------------------------------------------------------------------
create or replace function public.enforce_subscription_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      jsonb;
  v_old      jsonb;
  v_hospital uuid;
  v_status   text;
  v_allowed  text[];
  v_changed  text;
  v_block    boolean := false;
begin
  -- Trusted callers: no signed-in user (service role, cron, migrations).
  if auth.uid() is null then
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;

  begin
    -- The platform owner is never locked.
    if public.is_owner() then
      return case when TG_OP = 'DELETE' then OLD else NEW end;
    end if;

    v_row := to_jsonb(case when TG_OP = 'DELETE' then OLD else NEW end);
    v_hospital := nullif(v_row->>'hospital_id', '')::uuid;

    -- roster_entries has no hospital_id of its own: use its roster's.
    if v_hospital is null and TG_TABLE_NAME = 'roster_entries' then
      select r.hospital_id into v_hospital
        from public.rosters r
       where r.id = nullif(v_row->>'roster_id', '')::uuid;
    end if;

    if v_hospital is not null then
      select s.status into v_status
        from public.subscriptions s
       where s.hospital_id = v_hospital;
    end if;

    if v_status in ('expired', 'suspended') then
      v_block := true;

      -- The only columns that may still change on these two tables.
      -- updated_at is included because the updated_at trigger changes it.
      v_allowed := case TG_TABLE_NAME
        when 'prescriptions' then array['status', 'administered_at', 'administered_by', 'updated_at']
        when 'patients'      then array['queue_status', 'queue_updated_at', 'updated_at']
        else null
      end;

      -- Is this really an UPDATE? The offline sync sends everything as an
      -- "upsert", which arrives here as an INSERT even when the row exists.
      if TG_OP = 'UPDATE' then
        v_old := to_jsonb(OLD);
      elsif TG_OP = 'INSERT' then
        begin
          execute format('select to_jsonb(t) from %I.%I t where t.id = $1', TG_TABLE_SCHEMA, TG_TABLE_NAME)
            into v_old
            using (v_row->>'id')::uuid;
        exception when others then
          v_old := null;
        end;
      end if;

      if v_old is not null then
        -- An update: allowed only if nothing OUTSIDE the allowed columns
        -- actually changed (a save that changes nothing is harmless).
        select k into v_changed
          from jsonb_object_keys(v_row) as k
         where (v_row -> k) is distinct from (v_old -> k)
           and not (k = any (coalesce(v_allowed, array[]::text[])))
         limit 1;
        if v_changed is null then
          v_block := false;
        end if;
      end if;
    end if;
  exception when others then
    v_block := false;   -- fail-open (see header)
  end;

  if v_block then
    raise exception 'This hospital''s subscription is %, so changes cannot be saved. Existing records are safe and can still be viewed.', v_status
      using errcode = '42501',
            hint = 'Renew the subscription to restore editing.';
  end if;

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

-- Attach it to every table the app writes to (except the exempt ones).
-- A table that does not exist is skipped with a notice, not an error.
do $$
declare
  t text;
begin
  foreach t in array array[
    'admission_requests', 'admission_timeline_events', 'admissions',
    'appointments', 'beds', 'billable_charges',
    'handover_patients', 'handover_tasks', 'insurance_claims',
    'inventory_items', 'invoice_items', 'invoices',
    'lab_orders', 'lab_tests',
    'patient_drug_charts', 'patient_stock_records', 'patients', 'payments',
    'pharmacy_items', 'pharmacy_orders',
    'prescription_templates', 'prescriptions',
    'radiology_scans', 'roster_entries', 'rosters', 'shift_handovers'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_subscription_lock on public.%I', t);
      execute format(
        'create trigger trg_subscription_lock before insert or update or delete on public.%I
           for each row execute function public.enforce_subscription_lock()', t);
    else
      raise notice 'trg_subscription_lock: skipped %, table not found', t;
    end if;
  end loop;
end
$$;


-- ---------------------------------------------------------------------
-- 2. Patient limit
-- ---------------------------------------------------------------------
create or replace function public.enforce_plan_patient_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_count bigint;
  v_block boolean := false;
begin
  if auth.uid() is null then
    return NEW;
  end if;

  begin
    if public.is_owner() then
      return NEW;
    end if;

    -- A re-save (upsert) of an existing patient is not a NEW patient.
    if exists (select 1 from public.patients p where p.id = NEW.id) then
      return NEW;
    end if;

    select nullif(pl.limits ->> 'max_patients', '')::int
      into v_limit
      from public.subscriptions s
      join public.subscription_plans pl on pl.id = s.plan_id
     where s.hospital_id = NEW.hospital_id;

    if v_limit is not null then
      select count(*) into v_count
        from public.patients p
       where p.hospital_id = NEW.hospital_id
         and p.deleted_at is null;
      if v_count >= v_limit then
        v_block := true;
      end if;
    end if;
  exception when others then
    v_block := false;   -- fail-open
  end;

  if v_block then
    raise exception 'Your plan allows up to % patients and that limit has been reached. Existing records are safe. Please upgrade the plan.', v_limit
      using errcode = '42501';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_plan_patient_limit on public.patients;
create trigger trg_plan_patient_limit
  before insert on public.patients
  for each row execute function public.enforce_plan_patient_limit();


-- ---------------------------------------------------------------------
-- 3. Staff re-activation
-- ---------------------------------------------------------------------
create or replace function public.enforce_plan_staff_reactivate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit  int;
  v_status text;
  v_count  bigint;
  v_msg    text;
begin
  if auth.uid() is null then
    return NEW;
  end if;

  begin
    if public.is_owner() then
      return NEW;
    end if;

    -- Only the moment an account goes from inactive to active matters.
    if coalesce(OLD.active, true) = false
       and coalesce(NEW.active, true) = true
       and NEW.hospital_id is not null then

      select s.status, nullif(pl.limits ->> 'max_staff', '')::int
        into v_status, v_limit
        from public.subscriptions s
        join public.subscription_plans pl on pl.id = s.plan_id
       where s.hospital_id = NEW.hospital_id;

      if v_status in ('expired', 'suspended') then
        v_msg := format('This hospital''s subscription is %s, so staff accounts cannot be re-activated right now.', v_status);
      elsif v_limit is not null then
        select count(*) into v_count
          from public.profiles p
         where p.hospital_id = NEW.hospital_id
           and coalesce(p.active, true) = true
           and p.id <> NEW.id;
        if v_count >= v_limit then
          v_msg := format('Your plan allows up to %s active staff accounts and that limit has been reached. Please upgrade the plan.', v_limit);
        end if;
      end if;
    end if;
  exception when others then
    v_msg := null;   -- fail-open
  end;

  if v_msg is not null then
    raise exception '%', v_msg using errcode = '42501';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_plan_staff_reactivate on public.profiles;
create trigger trg_plan_staff_reactivate
  before update of active on public.profiles
  for each row execute function public.enforce_plan_staff_reactivate();


-- ---------------------------------------------------------------------
-- Check it worked: this lists every trigger this file created.
-- ---------------------------------------------------------------------
--   select event_object_table as table_name, trigger_name
--   from information_schema.triggers
--   where trigger_name in ('trg_subscription_lock', 'trg_plan_patient_limit', 'trg_plan_staff_reactivate')
--   group by 1, 2
--   order by 1;
