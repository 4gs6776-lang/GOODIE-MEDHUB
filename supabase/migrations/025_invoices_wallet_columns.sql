-- =====================================================================
-- GOODIE-MEDHUB — 025_invoices_wallet_columns.sql
-- Adds wallet_deduction + wallet_id columns to invoices.
--
-- When the cashier generates an invoice, if the patient has a wallet
-- balance, the system auto-deducts from it first. These two columns
-- record how much came from the wallet and which wallet was used, so
-- the printed bill can show "Paid from wallet: ₦X" alongside the
-- other payment details.
--
-- SAFE TO RE-RUN: every statement uses IF NOT EXISTS.
-- =====================================================================

alter table public.invoices
  add column if not exists wallet_deduction numeric(14, 2) not null default 0,
  add column if not exists wallet_id        uuid;

-- Index for "all invoices that used a wallet" queries
create index if not exists invoices_wallet_idx
  on public.invoices (hospital_id, wallet_id)
  where wallet_id is not null;

-- ---------------------------------------------------------------------
-- Verification:
--   select column_name, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'invoices'
--      and column_name like 'wallet%';
--   -- should return: wallet_deduction, wallet_id
-- ---------------------------------------------------------------------
