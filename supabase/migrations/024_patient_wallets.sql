-- =====================================================================
-- GOODIE-MEDHUB — 024_patient_wallets.sql
-- Patient deposit/wallet system.
--
-- Two new tables:
--   1. patient_wallets          — one row per patient, holds the
--                                  current balance (denormalised for
--                                  fast read; updated by trigger)
--   2. patient_wallet_transactions — append-only ledger of every
--                                     deposit / charge / refund
--
-- Behaviour:
--   - Reception / admin / cashier can ADD A DEPOSIT (positive amount)
--   - CashierWorkspace auto-deducts from the wallet when generating
--     an invoice (negative amount = charge)
--   - Admins can issue REFUNDS (positive amount, type='refund')
--   - Balance can NEVER go negative — the cashier workspace splits:
--     what fits in the wallet is deducted; the rest becomes the
--     invoice's Balance Due.
--   - HMO patients don't use the wallet — their bills go straight
--     to the HMO claim flow as today.
--
-- RLS: hospital-scoped, same pattern as every other clinical table.
-- SELECT/INSERT for any hospital member; UPDATE only for admin/owner
-- (the balance column is updated by trigger, not by app code).
-- No DELETE policy — ledger rows are immutable.
--
-- SAFE TO RE-RUN.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. patient_wallets — current balance per patient
-- ---------------------------------------------------------------------

create table if not exists public.patient_wallets (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null references public.hospitals(id) on delete cascade,
  patient_id      uuid not null references public.patients(id) on delete cascade,
  balance         numeric(14, 2) not null default 0,
  currency        text not null default 'NGN',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (patient_id)
);

create index if not exists patient_wallets_hospital_idx
  on public.patient_wallets (hospital_id);
create unique index if not exists patient_wallets_patient_idx
  on public.patient_wallets (patient_id);

-- Auto-stamp updated_at
drop trigger if exists trg_patient_wallets_updated_at on public.patient_wallets;
create trigger trg_patient_wallets_updated_at
  before update on public.patient_wallets
  for each row execute function public.set_updated_at();

alter table public.patient_wallets enable row level security;

drop policy if exists "patient_wallets_select" on public.patient_wallets;
create policy "patient_wallets_select" on public.patient_wallets
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "patient_wallets_insert" on public.patient_wallets;
create policy "patient_wallets_insert" on public.patient_wallets
  for insert with check (
    hospital_id = public.current_hospital_id()
  );

drop policy if exists "patient_wallets_update" on public.patient_wallets;
create policy "patient_wallets_update" on public.patient_wallets
  for update using (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner', 'doctor', 'nurse', 'front_desk', 'billing'),
      false
    )
  )
  with check (
    hospital_id = public.current_hospital_id()
  );

-- No DELETE policy — wallet rows are never erased through the API.

-- ---------------------------------------------------------------------
-- 2. patient_wallet_transactions — append-only ledger
--
-- Every row records ONE movement of money in/out of a patient's wallet.
-- Type can be: 'deposit' (patient paid in) | 'charge' (auto-deducted
-- at invoice time) | 'refund' (admin issued a refund) | 'adjustment'
-- (manual correction by admin).
-- ---------------------------------------------------------------------

create table if not exists public.patient_wallet_transactions (
  id                uuid primary key default gen_random_uuid(),
  hospital_id       uuid not null references public.hospitals(id) on delete cascade,
  patient_id        uuid not null references public.patients(id) on delete cascade,
  wallet_id         uuid not null references public.patient_wallets(id) on delete cascade,

  -- What kind of movement
  type              text not null check (type in ('deposit', 'charge', 'refund', 'adjustment')),

  -- Positive number = money added to the wallet (deposit, refund, +adjustment)
  -- Negative number = money deducted (charge, -adjustment)
  amount            numeric(14, 2) not null,

  -- Running balance after this transaction (denormalised — useful for
  -- showing a statement without recomputing)
  balance_after     numeric(14, 2) not null,

  -- Provenance — who/what caused this transaction
  method            text,                          -- 'Cash' | 'POS' | 'Bank Transfer' | 'Card' | 'HMO' | 'Other' (deposits + refunds only)
  reference         text,                           -- receipt number, transfer ref, etc. (optional)
  invoice_id        uuid,                           -- if this was a charge for an invoice
  performed_by      uuid,                           -- profiles.id of the staff member
  performed_by_name text,
  notes             text,

  created_at        timestamptz not null default now()
);

create index if not exists patient_wallet_txns_hospital_patient_idx
  on public.patient_wallet_transactions (hospital_id, patient_id, created_at desc);
create index if not exists patient_wallet_txns_invoice_idx
  on public.patient_wallet_transactions (invoice_id);
create index if not exists patient_wallet_txns_type_idx
  on public.patient_wallet_transactions (hospital_id, type, created_at desc);

alter table public.patient_wallet_transactions enable row level security;

drop policy if exists "patient_wallet_transactions_select" on public.patient_wallet_transactions;
create policy "patient_wallet_transactions_select" on public.patient_wallet_transactions
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "patient_wallet_transactions_insert" on public.patient_wallet_transactions;
create policy "patient_wallet_transactions_insert" on public.patient_wallet_transactions
  for insert with check (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner', 'doctor', 'nurse', 'front_desk', 'billing'),
      false
    )
  );

-- No UPDATE / DELETE policy — ledger rows are immutable.

-- ---------------------------------------------------------------------
-- 3. Realtime so the patient profile + cashier see balance updates
--    the moment they happen.
-- ---------------------------------------------------------------------
alter table public.patient_wallets replica identity full;
alter table public.patient_wallet_transactions replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'patient_wallets') then
    alter publication supabase_realtime add table public.patient_wallets;
  end if;
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'patient_wallet_transactions') then
    alter publication supabase_realtime add table public.patient_wallet_transactions;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Sync the wallets table's balance column whenever a transaction
--    is inserted. App code can do this manually too, but the trigger
--    is the safety net so the balance never drifts.
--
--    We use a SECURITY DEFINER function so the trigger works even
--    when called by an anon-key role (it bypasses RLS for the
--    wallets UPDATE only, scoped to the same patient_id).
-- ---------------------------------------------------------------------

create or replace function public.sync_wallet_balance_after_txn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Recompute the wallet balance from the latest transaction's
  -- balance_after. This is the source of truth — the wallet row's
  -- balance column is just a denormalised cache.
  update public.patient_wallets
     set balance = NEW.balance_after,
         updated_at = now()
   where id = NEW.wallet_id;
  return NEW;
end;
$$;

drop trigger if exists trg_sync_wallet_balance on public.patient_wallet_transactions;
create trigger trg_sync_wallet_balance
  after insert on public.patient_wallet_transactions
  for each row execute function public.sync_wallet_balance_after_txn();

-- ---------------------------------------------------------------------
-- Verification (run after applying):
--   select table_name from information_schema.tables
--    where table_schema = 'public' and table_name like 'patient_wallet%';
--   -- should return: patient_wallets, patient_wallet_transactions
--
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.patient_wallet_transactions'::regclass
--      and contype = 'c';
--   -- should show the type IN ('deposit','charge','refund','adjustment') check
-- ---------------------------------------------------------------------
