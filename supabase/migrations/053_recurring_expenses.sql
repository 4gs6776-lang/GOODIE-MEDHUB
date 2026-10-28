-- =====================================================================
-- GOODIE-MEDHUB — 053_recurring_expenses.sql
-- Phase 4 — Recurring expense templates.
--
-- Each row = a template for an expense that should be auto-posted on
-- a schedule (weekly, monthly, quarterly, yearly). e.g.:
--   - ₦500k staff salaries, monthly, posts on the 1st
--   - ₦150k rent, monthly, posts on the 1st
--   - ₦40k NEPA bill, monthly, posts on the 5th
--   - ₦2M annual insurance premium, yearly, posts on Jan 1st
--
-- When the due date arrives, the system (or admin clicking "Post Now")
-- creates a hospital_expenses row using the template, then advances
-- next_due_date by the frequency.
--
-- SAFE TO RE-RUN.
-- =====================================================================

create table if not exists public.recurring_expenses (
  id                uuid primary key default gen_random_uuid(),
  hospital_id       uuid not null references public.hospitals(id) on delete cascade,

  -- What + how much
  description       text not null,
  category          text not null check (category in (
    'Salaries & Wages', 'Rent', 'Utilities', 'Medical Supplies', 'Office Supplies',
    'Equipment Purchase', 'Equipment Maintenance', 'Cleaning & Hygiene',
    'Transport / Fuel', 'Bank Charges', 'Marketing', 'Miscellaneous'
  )),
  amount            numeric(14, 2) not null check (amount > 0),
  payment_method    text not null default 'Cash'
    check (payment_method in ('Cash', 'Bank Transfer', 'POS', 'Cheque', 'Other')),

  -- Vendor link (optional)
  vendor_id         uuid,

  -- Schedule
  frequency         text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  -- Day of month for monthly/quarterly/yearly (1-31). Day of week for weekly (0=Sun, 6=Sat)
  day_of_month      integer not null default 1 check (day_of_month >= 1 and day_of_month <= 31),
  next_due_date     date not null,
  end_date          date,  -- NULL = never ends

  -- Auto-post: if true, the system posts automatically on due date
  -- (requires a server-side cron — Phase 4+ ships the schema, the cron
  --  is a follow-up serverless function). If false, admin must click "Post Now".
  auto_post         boolean not null default false,

  -- Approval workflow: if amount > approval_threshold, posts require approval
  requires_approval boolean not null default false,
  approval_threshold numeric(14, 2) not null default 0,

  -- Tracking
  last_posted_at    timestamptz,
  last_posted_expense_id uuid,  -- FK to hospital_expenses (loose — no constraint to allow re-creation)
  post_count        integer not null default 0,  -- how many times this has posted

  -- Reference number template (optional — auto-fills the reference_number
  -- on each generated expense, e.g. "RENT-{YYYY}-{MM}")
  reference_template text,

  notes             text,
  is_active         boolean not null default true,

  created_by        uuid,
  created_by_name   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists recurring_expenses_hospital_active_idx
  on public.recurring_expenses (hospital_id, is_active, next_due_date);
create index if not exists recurring_expenses_due_idx
  on public.recurring_expenses (next_due_date)
  where is_active = true;
create index if not exists recurring_expenses_vendor_idx
  on public.recurring_expenses (vendor_id)
  where vendor_id is not null;

alter table public.recurring_expenses enable row level security;

-- All hospital members can read.
drop policy if exists "recurring_expenses_select" on public.recurring_expenses;
create policy "recurring_expenses_select" on public.recurring_expenses
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- Only admin / owner / billing can create / update.
drop policy if exists "recurring_expenses_insert" on public.recurring_expenses;
create policy "recurring_expenses_insert" on public.recurring_expenses
  for insert with check (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner', 'billing'),
      false
    )
  );

drop policy if exists "recurring_expenses_update" on public.recurring_expenses;
create policy "recurring_expenses_update" on public.recurring_expenses
  for update using (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner', 'billing'),
      false
    )
  )
  with check (
    hospital_id = public.current_hospital_id()
  );

drop policy if exists "recurring_expenses_delete" on public.recurring_expenses;
create policy "recurring_expenses_delete" on public.recurring_expenses
  for delete using (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner'),
      false
    )
  );

drop trigger if exists trg_recurring_expenses_updated_at on public.recurring_expenses;
create trigger trg_recurring_expenses_updated_at
  before update on public.recurring_expenses
  for each row execute function public.set_updated_at();

alter table public.recurring_expenses replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recurring_expenses') then
    alter publication supabase_realtime add table public.recurring_expenses;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Verification:
--   select description, frequency, amount, next_due_date, is_active
--     from public.recurring_expenses
--    where hospital_id = '<your-hospital-id>' and is_active = true
--    order by next_due_date;
-- ---------------------------------------------------------------------
