-- =====================================================================
-- GOODIE-MEDHUB — Subscription system (Phase 4: database foundation)
--
-- Adds 4 new tables only. Does NOT alter any existing table.
-- Reuses helpers already defined in earlier migrations:
--   public.current_hospital_id()  (003_rls_policies.sql)
--   public.is_owner()             (003_rls_policies.sql)
--   public.set_updated_at()       (005_shift_handover.sql)
--
-- Safe to re-run: every create/policy/trigger drops-then-creates.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions needed later in Phase 5 (the daily status-check job and
-- the email-sending trigger). Enabling them now, but the actual cron
-- schedule and the email webhook trigger are NOT created in this file
-- — they call edge functions that don't exist yet. That wiring comes
-- in Phase 5, right after those functions are deployed.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- =====================================================================
-- 1. subscription_plans
--    Basic / Professional / Enterprise. Every price, limit and feature
--    lives here — nothing about a plan is hard-coded in the frontend.
--    The owner edits these rows from the Owner Portal (built in a
--    later phase); for now they're seeded with placeholder prices.
-- =====================================================================
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,                        -- 'basic' | 'professional' | 'enterprise'
  name text not null,
  description text,
  monthly_price numeric(12,2) not null default 0,
  yearly_price numeric(12,2) not null default 0,
  currency text not null default 'NGN',
  included_facilities integer not null default 1,
  additional_facility_monthly_price numeric(12,2) not null default 0,
  additional_facility_yearly_price numeric(12,2) not null default 0,
  trial_days integer not null default 30,
  trial_eligible boolean not null default true,
  features jsonb not null default '[]'::jsonb,      -- e.g. ["Unlimited patients","Pharmacy module"]
  limits jsonb not null default '{}'::jsonb,         -- e.g. {"max_staff": 10, "max_patients": 500}
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subscription_plans is
  'Configurable subscription plans. Edited only by the platform owner.';

drop trigger if exists trg_subscription_plans_updated_at on public.subscription_plans;
create trigger trg_subscription_plans_updated_at
  before update on public.subscription_plans
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 2. subscriptions
--    One row per hospital. This is the single source of truth for
--    "is this hospital allowed to use the app right now?" — the
--    frontend only ever displays this status, it never computes it.
-- =====================================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null unique references public.hospitals(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly','yearly')),
  status text not null default 'trialing'
    check (status in ('trialing','active','past_due','grace_period','expired','cancelled','suspended')),
  trial_start date,
  trial_end date,
  trial_used boolean not null default false,
  current_period_start date,
  current_period_end date,
  grace_period_end date,
  cancel_at_period_end boolean not null default false,
  auto_renew boolean not null default false,        -- becomes usable once a real payment provider is wired up
  facility_count_at_billing integer not null default 1,
  last_verified_at timestamptz not null default now(), -- stamped by the daily scheduler (Phase 5); shown to the
                                                          -- hospital as "status last verified ..." when offline
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subscriptions is
  'One row per hospital. status is authoritative and is never inferred purely from dates in the frontend.';

create index if not exists idx_subscriptions_status on public.subscriptions(status);
create index if not exists idx_subscriptions_plan on public.subscriptions(plan_id);

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 3. subscription_payments
--    Every manual bank-transfer submission (and, later, every real
--    payment-provider transaction). amount/currency below are ALWAYS
--    recalculated by a trigger from subscription_plans + the
--    hospital's active facility count — never trusted from whatever a
--    client sends. This is what makes "never trust frontend prices"
--    actually true rather than just a comment.
-- =====================================================================
create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  billing_cycle text not null check (billing_cycle in ('monthly','yearly')),
  provider text not null default 'manual_bank_transfer',
  provider_reference text,
  amount numeric(12,2) not null default 0,          -- overwritten by trigger below, ignore client value
  currency text not null default 'NGN',
  status text not null default 'submitted'
    check (status in ('submitted','verified','rejected','failed')),
  proof_note text,                                  -- what the hospital typed: bank, date paid, etc.
  proof_url text,                                   -- optional uploaded proof of payment
  period_start date,
  period_end date,
  submitted_by uuid references public.profiles(id),
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  rejection_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subscription_payments is
  'Manual-transfer submissions (and future provider transactions). amount is server-computed, never client-supplied.';

create index if not exists idx_subscription_payments_hospital on public.subscription_payments(hospital_id);
create index if not exists idx_subscription_payments_status on public.subscription_payments(status);

drop trigger if exists trg_subscription_payments_updated_at on public.subscription_payments;
create trigger trg_subscription_payments_updated_at
  before update on public.subscription_payments
  for each row execute function public.set_updated_at();

create or replace function public.compute_subscription_payment_amount()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  plan record;
  facility_count integer;
  extra_facilities integer;
  base_price numeric(12,2);
  extra_price numeric(12,2);
begin
  select * into plan from public.subscription_plans where id = new.plan_id;
  if not found then
    raise exception 'Unknown subscription plan: %', new.plan_id;
  end if;

  select count(*) into facility_count
    from public.facilities
    where hospital_id = new.hospital_id and active = true;

  if facility_count < 1 then
    facility_count := 1;
  end if;

  extra_facilities := greatest(facility_count - plan.included_facilities, 0);

  if new.billing_cycle = 'yearly' then
    base_price := plan.yearly_price;
    extra_price := plan.additional_facility_yearly_price * extra_facilities;
  else
    base_price := plan.monthly_price;
    extra_price := plan.additional_facility_monthly_price * extra_facilities;
  end if;

  new.amount := base_price + extra_price;
  new.currency := plan.currency;
  return new;
end;
$$;

drop trigger if exists trg_subscription_payments_compute_amount on public.subscription_payments;
create trigger trg_subscription_payments_compute_amount
  before insert on public.subscription_payments
  for each row execute function public.compute_subscription_payment_amount();

-- =====================================================================
-- 4. notifications
--    Persisted, dismissible, hospital-scoped alerts (read/unread).
--    Built generically — not exclusive to subscriptions — so other
--    modules can reuse it later. The actual "send an email when one
--    of these is created" trigger is added in Phase 5, once the
--    send-subscription-email edge function exists to receive it.
-- =====================================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  recipient_id uuid references public.profiles(id),   -- null = every admin/owner at that hospital
  category text not null default 'subscription',       -- 'subscription' today; other modules can use this later
  title text not null,
  body text,
  action_url text,
  severity text not null default 'info'
    check (severity in ('info','warning','critical')),
  metadata jsonb not null default '{}'::jsonb,
  email_status text not null default 'pending'
    check (email_status in ('pending','sent','failed','skipped')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.notifications is
  'Persisted, dismissible hospital alerts. Hospital members may only ever change read_at on their own rows.';

create index if not exists idx_notifications_hospital on public.notifications(hospital_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications(hospital_id, read_at);

-- Belt-and-braces column lock: RLS (below) allows a hospital member to
-- UPDATE their own hospital's notification rows (so they can mark one
-- read), but this trigger silently forces every column except read_at
-- back to its previous value unless the caller is the platform owner.
create or replace function public.protect_notification_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_owner() then
    return new;
  end if;
  new.hospital_id := old.hospital_id;
  new.recipient_id := old.recipient_id;
  new.category := old.category;
  new.title := old.title;
  new.body := old.body;
  new.action_url := old.action_url;
  new.severity := old.severity;
  new.metadata := old.metadata;
  new.email_status := old.email_status;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists trg_notifications_protect_fields on public.notifications;
create trigger trg_notifications_protect_fields
  before update on public.notifications
  for each row execute function public.protect_notification_fields();

-- =====================================================================
-- Row Level Security — mirrors the existing `hospitals` table pattern:
-- a hospital member can only ever SELECT their own hospital's rows;
-- only the platform owner (is_owner()) can INSERT/UPDATE/DELETE
-- subscription/payment records, with one deliberate carve-out below
-- letting a hospital's own admin submit a manual payment.
-- =====================================================================

-- ---- subscription_plans: everyone can read (needed to show plan
-- ---- choices/prices); only the owner configures them.
alter table public.subscription_plans enable row level security;

drop policy if exists subscription_plans_select on public.subscription_plans;
create policy subscription_plans_select on public.subscription_plans
  for select using (true);

drop policy if exists subscription_plans_insert on public.subscription_plans;
create policy subscription_plans_insert on public.subscription_plans
  for insert with check (public.is_owner());

drop policy if exists subscription_plans_update on public.subscription_plans;
create policy subscription_plans_update on public.subscription_plans
  for update using (public.is_owner()) with check (public.is_owner());

drop policy if exists subscription_plans_delete on public.subscription_plans;
create policy subscription_plans_delete on public.subscription_plans
  for delete using (public.is_owner());

-- ---- subscriptions: hospital reads its own row; only the owner (or
-- ---- a service-role edge function acting on the owner's behalf)
-- ---- ever changes a status, plan, or date.
alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select using (hospital_id = public.current_hospital_id() or public.is_owner());

drop policy if exists subscriptions_insert on public.subscriptions;
create policy subscriptions_insert on public.subscriptions
  for insert with check (public.is_owner());

drop policy if exists subscriptions_update on public.subscriptions;
create policy subscriptions_update on public.subscriptions
  for update using (public.is_owner()) with check (public.is_owner());

drop policy if exists subscriptions_delete on public.subscriptions;
create policy subscriptions_delete on public.subscriptions
  for delete using (public.is_owner());

-- ---- subscription_payments: hospital reads its own payment history.
-- ---- A hospital's own admin may submit ONE thing: a brand-new row
-- ---- for their own hospital, status forced to 'submitted', with no
-- ---- verification fields set. Only the owner can verify/reject/edit
-- ---- afterwards.
alter table public.subscription_payments enable row level security;

drop policy if exists subscription_payments_select on public.subscription_payments;
create policy subscription_payments_select on public.subscription_payments
  for select using (hospital_id = public.current_hospital_id() or public.is_owner());

drop policy if exists subscription_payments_insert on public.subscription_payments;
create policy subscription_payments_insert on public.subscription_payments
  for insert with check (
    public.is_owner()
    or (
      hospital_id = public.current_hospital_id()
      and status = 'submitted'
      and verified_by is null
      and verified_at is null
      and rejection_reason is null
      and (select role from public.profiles where id = auth.uid()) = 'admin'
      and exists (
        select 1 from public.subscriptions s
        where s.id = subscription_id and s.hospital_id = public.current_hospital_id()
      )
    )
  );

drop policy if exists subscription_payments_update on public.subscription_payments;
create policy subscription_payments_update on public.subscription_payments
  for update using (public.is_owner()) with check (public.is_owner());

drop policy if exists subscription_payments_delete on public.subscription_payments;
create policy subscription_payments_delete on public.subscription_payments
  for delete using (public.is_owner());

-- ---- notifications: hospital reads its own; owner (or a service-role
-- ---- edge function) creates them; a hospital member may run an
-- ---- UPDATE on their own hospital's row, but the trigger above
-- ---- ensures only read_at can actually change.
alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (hospital_id = public.current_hospital_id() or public.is_owner());

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
  for insert with check (public.is_owner());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (hospital_id = public.current_hospital_id() or public.is_owner())
  with check (hospital_id = public.current_hospital_id() or public.is_owner());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete using (public.is_owner());

-- =====================================================================
-- Seed the three plans with placeholder prices (NGN). Edit these
-- later from the Owner Portal once the plan-configuration screen
-- exists (Phase 7) — nothing here is final.
-- =====================================================================
insert into public.subscription_plans
  (slug, name, description, monthly_price, yearly_price, currency,
   included_facilities, additional_facility_monthly_price, additional_facility_yearly_price,
   trial_days, features, limits, sort_order)
values
  ('basic', 'Basic',
   'Core hospital records for a single-facility clinic.',
   15000, 150000, 'NGN', 1, 5000, 50000, 30,
   '["Patient records","Appointments","Basic billing"]'::jsonb,
   '{"max_staff": 5, "max_patients": 200}'::jsonb, 1),
  ('professional', 'Professional',
   'Full clinical workflow for a growing hospital.',
   35000, 350000, 'NGN', 1, 8000, 80000, 30,
   '["Everything in Basic","Laboratory","Pharmacy","Doctor Workbench","Shift handover"]'::jsonb,
   '{"max_staff": 25, "max_patients": 2000}'::jsonb, 2),
  ('enterprise', 'Enterprise',
   'Unlimited scale across multiple facilities.',
   75000, 750000, 'NGN', 2, 10000, 100000, 30,
   '["Everything in Professional","Multi-facility","Priority support","Advanced reports"]'::jsonb,
   '{"max_staff": null, "max_patients": null}'::jsonb, 3)
on conflict (slug) do nothing;

-- =====================================================================
-- Backfill: every hospital that already exists gets a subscriptions
-- row right now, so nothing breaks the moment this table starts being
-- read. Existing hospitals are treated as already-active on the plan
-- that best matches their current subscription_tier, for 1 year, NOT
-- as a fresh trial (the 30-day trial is for hospitals created from now
-- on). The owner can adjust any of these dates/plans afterwards.
-- Safe to re-run — a hospital that already has a row is skipped.
-- =====================================================================
insert into public.subscriptions
  (hospital_id, plan_id, billing_cycle, status, current_period_start, current_period_end, facility_count_at_billing)
select
  h.id,
  case h.subscription_tier
    when 'tier1' then (select id from public.subscription_plans where slug = 'basic')
    when 'tier2' then (select id from public.subscription_plans where slug = 'professional')
    when 'tier3' then (select id from public.subscription_plans where slug = 'enterprise')
    else (select id from public.subscription_plans where slug = 'basic')
  end,
  'monthly',
  case when h.status = 'suspended' then 'suspended' else 'active' end,
  current_date,
  current_date + interval '1 year',
  greatest((select count(*) from public.facilities f where f.hospital_id = h.id and f.active = true), 1)
from public.hospitals h
where not exists (select 1 from public.subscriptions s where s.hospital_id = h.id);
