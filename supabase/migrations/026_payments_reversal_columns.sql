-- =====================================================================
-- GOODIE-MEDHUB — 026_payments_reversal_columns.sql
-- Adds reversal columns to the payments table.
--
-- When a payment is voided (reversed), these fields record who did it,
-- when, and why. The payment row is NEVER deleted — it's marked as
-- 'reversed' and the invoice's amount_paid/balance/status are adjusted
-- to undo the financial effect.
--
-- SAFE TO RE-RUN: every statement uses IF NOT EXISTS.
-- =====================================================================

alter table public.payments
  add column if not exists status           text not null default 'completed',
  add column if not exists reversed_by      uuid,
  add column if not exists reversed_by_name text,
  add column if not exists reversed_at      timestamptz,
  add column if not exists reversal_reason  text;

-- Index for the Payments tab filter (active vs reversed)
create index if not exists payments_hospital_status_idx
  on public.payments (hospital_id, status, created_at desc);

-- ---------------------------------------------------------------------
-- Backfill: any existing payments without a status get 'completed'.
-- ---------------------------------------------------------------------
update public.payments
   set status = 'completed'
 where status is null or status = '';

-- ---------------------------------------------------------------------
-- Verification:
--   select column_name, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'payments'
--      and column_name in ('status', 'reversed_by', 'reversed_by_name',
--                          'reversed_at', 'reversal_reason');
--   -- should return 5 rows
-- ---------------------------------------------------------------------
