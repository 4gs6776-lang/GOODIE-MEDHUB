-- =====================================================================
-- GOODIE-MEDHUB — 057_lab_walkin_and_verification.sql
-- Adds walk-in lab request + verification + correction columns to
-- both lab_tests and lab_orders.
--
-- New columns (added to BOTH tables for consistency):
--   request_number          — sequential walk-in request number (NULL for doctor orders)
--   request_origin          — 'walk_in' | 'doctor' (default 'doctor')
--   payment_status          — 'unpaid' | 'paid' | 'authorized' | 'not_required'
--   sample_type             — blood / urine / stool / swab / etc.
--   requires_clinician_order — boolean (true = cannot be walk-in)
--   resulted_by             — who entered the result (separate from verified_by)
--   verified_at             — when verification happened
--   previous_result         — for corrections (stores the old result value)
--   correction_reason       — why the result was corrected
--   corrected_by             — who corrected it
--   cancel_type              — 'before_collection' | 'after_collection' | 'sample_rejected' | 'refund'
--
-- SAFE TO RE-RUN.
-- =====================================================================

alter table public.lab_tests
  add column if not exists request_number           text,
  add column if not exists request_origin           text not null default 'walk_in'
    check (request_origin in ('walk_in', 'doctor')),
  add column if not exists payment_status           text not null default 'not_required'
    check (payment_status in ('unpaid', 'paid', 'authorized', 'not_required')),
  add column if not exists sample_type              text,
  add column if not exists requires_clinician_order boolean not null default false,
  add column if not exists resulted_by              text,
  add column if not exists verified_at              timestamptz,
  add column if not exists previous_result          text,
  add column if not exists correction_reason        text,
  add column if not exists corrected_by             text,
  add column if not exists cancel_type              text
    check (cancel_type is null or cancel_type in ('before_collection', 'after_collection', 'sample_rejected', 'refund'));

alter table public.lab_orders
  add column if not exists request_number           text,
  add column if not exists request_origin           text not null default 'doctor'
    check (request_origin in ('walk_in', 'doctor')),
  add column if not exists payment_status           text not null default 'not_required'
    check (payment_status in ('unpaid', 'paid', 'authorized', 'not_required')),
  add column if not exists sample_type              text,
  add column if not exists requires_clinician_order boolean not null default false,
  add column if not exists resulted_by              text,
  add column if not exists verified_at              timestamptz,
  add column if not exists previous_result          text,
  add column if not exists correction_reason        text,
  add column if not exists corrected_by             text,
  add column if not exists cancel_type              text
    check (cancel_type is null or cancel_type in ('before_collection', 'after_collection', 'sample_rejected', 'refund'));

-- Index for finding walk-in requests by request_number
create index if not exists lab_tests_request_number_idx
  on public.lab_tests (hospital_id, request_number)
  where request_number is not null;

create index if not exists lab_orders_request_number_idx
  on public.lab_orders (hospital_id, request_number)
  where request_number is not null;

-- Index for filtering by origin
create index if not exists lab_tests_origin_idx
  on public.lab_tests (hospital_id, request_origin);

create index if not exists lab_orders_origin_idx
  on public.lab_orders (hospital_id, request_origin);

-- ---------------------------------------------------------------------
-- Verification:
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'lab_tests'
--      and column_name in ('request_number','request_origin','payment_status',
--                          'sample_type','requires_clinician_order','resulted_by',
--                          'verified_at','previous_result','correction_reason',
--                          'corrected_by','cancel_type');
--   -- should return 11 rows
-- ---------------------------------------------------------------------
