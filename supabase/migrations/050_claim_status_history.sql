-- =====================================================================
-- GOODIE-MEDHUB — 050_claim_status_history.sql
-- Phase 3 — Append-only audit trail of every claim status change.
--
-- Every time a claim's status changes (submitted → queried → approved →
-- paid, or submitted → rejected, etc.), one row is inserted here with
-- the from_status, to_status, who changed it, when, and why.
--
-- This gives auditors a complete timeline of every claim's lifecycle.
-- Use it to answer questions like "who approved this claim and when?"
-- or "what reason did the HMO give for rejecting this claim?"
--
-- Run AFTER 049_insurance_claims_lifecycle.sql (FK to insurance_claims).
--
-- SAFE TO RE-RUN.
-- =====================================================================

create table if not exists public.claim_status_history (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null references public.hospitals(id) on delete cascade,
  claim_id        uuid not null references public.insurance_claims(id) on delete cascade,

  from_status     text not null,
  to_status       text not null
    check (to_status in ('submitted','queried','approved','paid','rejected','disputed','cancelled')),

  changed_by      uuid,
  changed_by_name text,
  changed_at      timestamptz not null default now(),

  -- Why the status changed (e.g. "HMO queried: missing diagnosis code"
  -- or "Approved per NHIS tariff" or "Rejected: service not covered")
  reason          text,

  -- Structured metadata (e.g. approval_amount, query_reason, etc.)
  metadata        jsonb,

  created_at      timestamptz not null default now()
);

create index if not exists claim_status_history_claim_idx
  on public.claim_status_history (claim_id, changed_at desc);
create index if not exists claim_status_history_hospital_idx
  on public.claim_status_history (hospital_id, changed_at desc);

alter table public.claim_status_history enable row level security;

-- All hospital members can read status history (financial transparency).
drop policy if exists "claim_status_history_select" on public.claim_status_history;
create policy "claim_status_history_select" on public.claim_status_history
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- Only admin / owner / billing can create status history rows.
drop policy if exists "claim_status_history_insert" on public.claim_status_history;
create policy "claim_status_history_insert" on public.claim_status_history
  for insert with check (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner', 'billing'),
      false
    )
  );

-- No UPDATE / DELETE — status history rows are append-only.

alter table public.claim_status_history replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'claim_status_history') then
    alter publication supabase_realtime add table public.claim_status_history;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Backfill: for existing claims, create an initial "submitted" status
-- history row so the timeline isn't empty.
-- ---------------------------------------------------------------------
insert into public.claim_status_history (hospital_id, claim_id, from_status, to_status, changed_by, changed_by_name, changed_at, reason, metadata)
select
  ic.hospital_id,
  ic.id,
  '(none)',
  'submitted',
  ic.created_by,
  'System (backfilled)',
  coalesce(ic.submitted_at, ic.created_at),
  'Initial submission (backfilled by Phase 3 migration)',
  jsonb_build_object('backfilled', true, 'amount', ic.amount, 'provider', ic.provider)
from public.insurance_claims ic
where not exists (
  select 1 from public.claim_status_history csh where csh.claim_id = ic.id
);

-- ---------------------------------------------------------------------
-- Verification:
--   select ic.claim_number, ic.status, csh.changed_at, csh.to_status, csh.reason
--     from public.insurance_claims ic
--     left join public.claim_status_history csh on csh.claim_id = ic.id
--    where ic.hospital_id = '<your-hospital-id>'
--    order by ic.created_at desc, csh.changed_at asc;
-- ---------------------------------------------------------------------
