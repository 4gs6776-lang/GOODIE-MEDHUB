-- =====================================================================
-- GOODIE-MEDHUB — 052_approval_requests.sql
-- Phase 4 — Generic approval workflow for financial actions.
--
-- One table handles all approval needs:
--   - discounts above a threshold
--   - write-offs
--   - refunds / reversals
--   - credit notes
--   - expenses above a threshold
--   - claim re-submissions
--
-- Workflow:
--   1. Cashier/billing officer performs an action that requires approval
--   2. System creates an approval_request (status='pending')
--   3. Admin/owner sees it in their approval queue (Settings → Approvals
--      OR a bell badge in the topbar)
--   4. Admin approves or rejects (with reason)
--   5. If approved → the action completes (e.g. credit note posted,
--      refund processed, expense recorded)
--   6. If rejected → the action is cancelled
--
-- SAFE TO RE-RUN.
-- =====================================================================

create table if not exists public.approval_requests (
  id                uuid primary key default gen_random_uuid(),
  hospital_id       uuid not null references public.hospitals(id) on delete cascade,

  -- What kind of approval is this?
  request_type      text not null check (request_type in (
    'discount', 'write_off', 'refund', 'credit_note', 'expense',
    'claim_resubmission', 'registration_fee_waiver', 'other'
  )),

  -- What entity is being approved?
  -- e.g. entityType='invoice', entityId=<invoice uuid>
  -- e.g. entityType='expense', entityId=null (the expense hasn't been created yet — payload has it)
  entity_type       text not null,
  entity_id         uuid,

  -- The amount being approved (for threshold-based approvals)
  amount            numeric(14, 2) not null default 0,

  -- Who requested it + why
  requested_by      uuid,
  requested_by_name text,
  requested_at      timestamptz not null default now(),
  reason            text not null,

  -- What role can approve this? (e.g. 'admin', 'owner')
  -- Default 'admin' — only admin/owner see it in their queue
  approver_role     text not null default 'admin',

  -- Approval state
  status            text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired')),

  -- Who approved/rejected + when + why
  approver_id       uuid,
  approver_name     text,
  approved_at       timestamptz,
  approval_reason   text,
  rejection_reason  text,

  -- Structured payload — varies by request_type
  -- e.g. for 'credit_note': { amount, reason_code, reason_text, refund_method, invoice_id }
  -- e.g. for 'expense': { category, description, amount, payment_method, vendor_id }
  -- e.g. for 'discount': { invoice_id, discount_amount, reason }
  payload           jsonb not null default '{}'::jsonb,

  -- When the request was actioned (approved → action performed,
  -- rejected → action cancelled). NULL until then.
  actioned_at       timestamptz,
  action_result     jsonb,  -- structured result of the action (e.g. credit_note_id)

  -- Auto-expire: requests older than X days with no decision get 'expired'
  -- (handled by a Phase 4+ cron job; for now, manual cleanup)
  expires_at        timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists approval_requests_hospital_status_idx
  on public.approval_requests (hospital_id, status, requested_at desc);
create index if not exists approval_requests_approver_idx
  on public.approval_requests (hospital_id, approver_role, status)
  where status = 'pending';
create index if not exists approval_requests_entity_idx
  on public.approval_requests (entity_type, entity_id)
  where entity_id is not null;
create index if not exists approval_requests_type_idx
  on public.approval_requests (hospital_id, request_type, status);

alter table public.approval_requests enable row level security;

-- All hospital members can READ approval requests (transparency).
drop policy if exists "approval_requests_select" on public.approval_requests;
create policy "approval_requests_select" on public.approval_requests
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- Any billing-role user can CREATE approval requests.
drop policy if exists "approval_requests_insert" on public.approval_requests;
create policy "approval_requests_insert" on public.approval_requests
  for insert with check (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner', 'billing', 'front_desk'),
      false
    )
  );

-- Only admin / owner can UPDATE (approve/reject) requests.
drop policy if exists "approval_requests_update" on public.approval_requests;
create policy "approval_requests_update" on public.approval_requests
  for update using (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner'),
      false
    )
  )
  with check (
    hospital_id = public.current_hospital_id()
  );

-- No DELETE — requests are append-only / status-flag-based.

drop trigger if exists trg_approval_requests_updated_at on public.approval_requests;
create trigger trg_approval_requests_updated_at
  before update on public.approval_requests
  for each row execute function public.set_updated_at();

alter table public.approval_requests replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'approval_requests') then
    alter publication supabase_realtime add table public.approval_requests;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Verification:
--   select request_type, status, count(*) from public.approval_requests
--    where hospital_id = '<your-hospital-id>' group by request_type, status;
-- ---------------------------------------------------------------------
