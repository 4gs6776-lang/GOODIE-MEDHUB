-- =====================================================================
-- GOODIE-MEDHUB — Subscription system (Phase 6: manual bank transfer)
--
-- Adds ONE new table: platform_bank_accounts. This holds the bank
-- details hospitals are shown when they choose "Pay by Bank Transfer".
-- Only the platform owner can add/edit these; every hospital user can
-- read the active ones so they can actually pay.
--
-- Safe to re-run.
-- =====================================================================

create table if not exists public.platform_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  account_name text not null,
  account_number text not null,
  currency text not null default 'NGN',
  instructions text,                 -- free text shown under the account details, e.g. "Use your hospital name as narration"
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.platform_bank_accounts is
  'Bank transfer instructions shown to hospitals paying manually. Managed only by the platform owner.';

drop trigger if exists trg_platform_bank_accounts_updated_at on public.platform_bank_accounts;
create trigger trg_platform_bank_accounts_updated_at
  before update on public.platform_bank_accounts
  for each row execute function public.set_updated_at();

alter table public.platform_bank_accounts enable row level security;

drop policy if exists platform_bank_accounts_select on public.platform_bank_accounts;
create policy platform_bank_accounts_select on public.platform_bank_accounts
  for select using (true);

drop policy if exists platform_bank_accounts_insert on public.platform_bank_accounts;
create policy platform_bank_accounts_insert on public.platform_bank_accounts
  for insert with check (public.is_owner());

drop policy if exists platform_bank_accounts_update on public.platform_bank_accounts;
create policy platform_bank_accounts_update on public.platform_bank_accounts
  for update using (public.is_owner()) with check (public.is_owner());

drop policy if exists platform_bank_accounts_delete on public.platform_bank_accounts;
create policy platform_bank_accounts_delete on public.platform_bank_accounts
  for delete using (public.is_owner());

-- One placeholder row so the payment screen isn't empty. Edit this
-- from the Owner Portal's new "Bank Accounts" section with your real
-- details — this is NOT a real account.
insert into public.platform_bank_accounts (bank_name, account_name, account_number, currency, instructions, sort_order)
select 'Example Bank', 'GOODIE-MEDHUB Ltd', '0000000000', 'NGN',
       'Use your hospital name as the transfer narration, then submit the reference below.', 1
where not exists (select 1 from public.platform_bank_accounts);
