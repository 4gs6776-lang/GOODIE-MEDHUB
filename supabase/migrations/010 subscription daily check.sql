-- =====================================================================
-- 010_subscription_daily_check.sql
--
-- REPO COPY of a migration that is ALREADY APPLIED to the live database
-- (project kzkvtzoqrxwekngmltrt). It was missing from the repository; this
-- file restores it so the database can be rebuilt from the repo.
--
-- The function below is the exact definition read back from the live
-- database on 2026-10-02 (pg_get_functiondef), and the schedule is the
-- exact live cron job:
--     subscription-daily-check | 30 0 * * * | select public.run_subscription_daily_check();
--
-- You do NOT need to run this on the live database. If you do, it is
-- harmless: the function is replaced by an identical one, the job is
-- re-created with the same schedule, and the index is only created if an
-- equivalent one does not already exist.
--
-- WHAT THE DAILY JOB DOES (00:30 UTC; "today" is worked out in EACH
-- hospital's own timezone, falling back to Africa/Lagos):
--   * trialing:      7 days before trial_end -> a warning notification;
--                    after trial_end -> status 'expired' + notification.
--   * active / past_due: 7 days before current_period_end -> a renewal
--                    reminder; after current_period_end -> status
--                    'grace_period' with grace_period_end = period end + 7
--                    days + notification.
--   * grace_period:  after grace_period_end -> status 'expired' +
--                    notification.
--   * every run stamps subscriptions.last_verified_at = now().
--   Every notification carries a dated key in metadata->>'event' and is
--   inserted with ON CONFLICT DO NOTHING against the unique index below,
--   so re-running the job never produces duplicates.
--
-- NOTE (existing wording, left as-is so this stays an exact copy): the
-- "trial ended" message always says "30-day trial", even if a plan's
-- trial_days is different.
-- =====================================================================

create extension if not exists pg_cron with schema extensions;

-- ---------------------------------------------------------------------
-- Dedupe index the function's ON CONFLICT clause relies on:
--   on conflict (hospital_id, (metadata ->> 'event')) where metadata ? 'event'
-- Created only if an equivalent unique index is not already there (the
-- live database already has one, under its own name).
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
      from pg_indexes
     where schemaname = 'public'
       and tablename = 'notifications'
       and indexdef ilike 'create unique index%'
       and indexdef ilike '%hospital_id%'
       and indexdef ilike '%metadata%'
       and indexdef ilike '%event%'
  ) then
    create unique index uq_notifications_hospital_event
      on public.notifications (hospital_id, (metadata ->> 'event'))
      where metadata ? 'event';
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- The daily check (exact live definition)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_subscription_daily_check()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  r record;
  local_today date;
begin
  update public.subscriptions set last_verified_at = now();

  for r in
    select s.*, h.timezone as hospital_timezone, h.name as hospital_name
    from public.subscriptions s
    join public.hospitals h on h.id = s.hospital_id
    where s.status in ('trialing', 'active', 'past_due', 'grace_period')
  loop
    local_today := (now() at time zone coalesce(r.hospital_timezone, 'Africa/Lagos'))::date;

    if r.status = 'trialing' and r.trial_end is not null then

      if local_today > r.trial_end then
        update public.subscriptions set status = 'expired' where id = r.id;

        insert into public.notifications
          (hospital_id, category, title, body, severity, email_status, metadata)
        values (
          r.hospital_id, 'subscription',
          'Your free trial has ended',
          format('%s''s 30-day trial ended on %s. Choose a plan to keep using GOODIE-MEDHUB.',
                 r.hospital_name, r.trial_end),
          'critical', 'skipped',
          jsonb_build_object('event', 'trial_expired:' || r.trial_end, 'subscription_id', r.id)
        )
        on conflict (hospital_id, (metadata ->> 'event')) where metadata ? 'event' do nothing;

      elsif local_today = r.trial_end - 7 then
        insert into public.notifications
          (hospital_id, category, title, body, severity, email_status, metadata)
        values (
          r.hospital_id, 'subscription',
          'Your free trial ends in 7 days',
          format('%s''s trial ends on %s. Choose a plan to avoid any interruption.',
                 r.hospital_name, r.trial_end),
          'warning', 'skipped',
          jsonb_build_object('event', 'trial_reminder_7d:' || r.trial_end, 'subscription_id', r.id)
        )
        on conflict (hospital_id, (metadata ->> 'event')) where metadata ? 'event' do nothing;
      end if;

    elsif r.status in ('active', 'past_due') and r.current_period_end is not null then

      if local_today > r.current_period_end then
        update public.subscriptions
          set status = 'grace_period', grace_period_end = r.current_period_end + 7
          where id = r.id;

        insert into public.notifications
          (hospital_id, category, title, body, severity, email_status, metadata)
        values (
          r.hospital_id, 'subscription',
          'Your subscription has expired',
          format('%s''s subscription expired on %s. You have until %s to renew before access is restricted.',
                 r.hospital_name, r.current_period_end, r.current_period_end + 7),
          'critical', 'skipped',
          jsonb_build_object('event', 'grace_period_started:' || r.current_period_end, 'subscription_id', r.id)
        )
        on conflict (hospital_id, (metadata ->> 'event')) where metadata ? 'event' do nothing;

      elsif local_today = r.current_period_end - 7 then
        insert into public.notifications
          (hospital_id, category, title, body, severity, email_status, metadata)
        values (
          r.hospital_id, 'subscription',
          'Your subscription renews in 7 days',
          format('%s''s current plan period ends on %s.', r.hospital_name, r.current_period_end),
          'warning', 'skipped',
          jsonb_build_object('event', 'renewal_reminder_7d:' || r.current_period_end, 'subscription_id', r.id)
        )
        on conflict (hospital_id, (metadata ->> 'event')) where metadata ? 'event' do nothing;
      end if;

    elsif r.status = 'grace_period' and r.grace_period_end is not null then

      if local_today > r.grace_period_end then
        update public.subscriptions set status = 'expired' where id = r.id;

        insert into public.notifications
          (hospital_id, category, title, body, severity, email_status, metadata)
        values (
          r.hospital_id, 'subscription',
          'Grace period has ended',
          format('%s''s 7-day grace period ended on %s. Some features are now restricted until renewal.',
                 r.hospital_name, r.grace_period_end),
          'critical', 'skipped',
          jsonb_build_object('event', 'grace_period_expired:' || r.grace_period_end, 'subscription_id', r.id)
        )
        on conflict (hospital_id, (metadata ->> 'event')) where metadata ? 'event' do nothing;
      end if;

    end if;
  end loop;
end;
$function$;

-- ---------------------------------------------------------------------
-- Schedule: every day at 00:30 UTC (exact live job). Any existing job
-- with this name is replaced, so running this twice never duplicates it.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'subscription-daily-check') then
    perform cron.unschedule('subscription-daily-check');
  end if;
  perform cron.schedule(
    'subscription-daily-check',
    '30 0 * * *',
    'select public.run_subscription_daily_check();'
  );
end
$$;
