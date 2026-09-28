-- =====================================================================
-- GOODIE-MEDHUB — Subscription system (realtime)
--
-- Lets the hospital's screen update instantly (no refresh) when the
-- owner approves a payment, changes a plan, suspends a subscription,
-- or a new notification is written. Follows the same pattern as
-- 006_handover_realtime.sql:
--   1) the table must be in the `supabase_realtime` publication
--   2) replica identity full, so UPDATE events carry the whole row
--
-- Realtime still respects Row Level Security: a hospital only ever
-- receives changes to ITS OWN rows.
--
-- Safe to re-run.
-- =====================================================================

alter table public.notifications        replica identity full;
alter table public.subscriptions        replica identity full;
alter table public.subscription_payments replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'subscriptions'
  ) then
    alter publication supabase_realtime add table public.subscriptions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'subscription_payments'
  ) then
    alter publication supabase_realtime add table public.subscription_payments;
  end if;
end $$;
