-- =====================================================================
-- GOODIE-MEDHUB — 042_credit_notes.sql
-- Credit notes — formal mechanism for refunding/crediting an invoice
-- after it has been finalized (e.g. patient was overcharged, line item
-- disputed, services not rendered, HMO short-paid).
--
-- Lifecycle:
--   draft → posted → (optionally reversed)
--
-- A credit note references the original invoice. When posted:
--   - If invoice was overpaid → refund the patient (cash or wallet credit)
--   - If invoice was paid exact → wallet credit for future use
--   - If invoice was unpaid → reduce the invoice balance
--
-- Run AFTER 041_invoices_phase2_columns.sql (FK to invoices).
--
-- SAFE TO RE-RUN.
-- =====================================================================

create table if not exists public.credit_notes (
  id                  uuid primary key default gen_random_uuid(),
  hospital_id         uuid not null references public.hospitals(id) on delete cascade,
  original_invoice_id uuid not null references public.invoices(id) on delete cascade,
  credit_note_number  text not null,  -- sequential, e.g. CN-000001

  amount              numeric(14, 2) not null check (amount > 0),

  -- Why the credit note was issued
  reason_code         text not null check (reason_code in (
    'overcharge', 'service_not_rendered', 'hmo_short_payment',
    'duplicate_charge', 'patient_dispute', 'pricing_error',
    'goodwill', 'other'
  )),
  reason_text         text not null,

  -- Which line item(s) the credit applies to (optional — null = whole invoice)
  invoice_item_id     uuid,

  -- Approval workflow (Phase 4 will formalize; for now cashier records who approved)
  approved_by         uuid,
  approved_at         timestamptz,
  approval_reason     text,

  -- Status
  status              text not null default 'draft' check (status in ('draft','posted','reversed')),
  posted_at           timestamptz,
  posted_by           uuid,

  -- Refund handling — how the credit was returned to the patient
  refund_method       text check (refund_method in ('cash','wallet','bank_transfer','none')),
  refund_reference    text,
  refunded_at         timestamptz,
  refunded_by         uuid,

  -- Reversal (if a posted credit note was itself reversed later)
  reversed_at         timestamptz,
  reversed_by         uuid,
  reversal_reason     text,

  -- Wallet link (if refund_method = 'wallet')
  wallet_transaction_id uuid,

  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (hospital_id, credit_note_number)
);

create index if not exists credit_notes_hospital_idx
  on public.credit_notes (hospital_id, created_at desc);
create index if not exists credit_notes_invoice_idx
  on public.credit_notes (original_invoice_id);
create index if not exists credit_notes_status_idx
  on public.credit_notes (hospital_id, status, created_at desc);

alter table public.credit_notes enable row level security;

-- All hospital members can read credit notes (financial transparency).
drop policy if exists "credit_notes_select" on public.credit_notes;
create policy "credit_notes_select" on public.credit_notes
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- Only admin / owner / billing can create / update credit notes.
drop policy if exists "credit_notes_insert" on public.credit_notes;
create policy "credit_notes_insert" on public.credit_notes
  for insert with check (
    hospital_id = public.current_hospital_id()
    and coalesce(
      (select role from public.profiles where id = auth.uid()) in ('admin', 'owner', 'billing'),
      false
    )
  );

drop policy if exists "credit_notes_update" on public.credit_notes;
create policy "credit_notes_update" on public.credit_notes
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

-- No DELETE policy — credit notes are append-only / status-flag-based.

drop trigger if exists trg_credit_notes_updated_at on public.credit_notes;
create trigger trg_credit_notes_updated_at
  before update on public.credit_notes
  for each row execute function public.set_updated_at();

alter table public.credit_notes replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'credit_notes') then
    alter publication supabase_realtime add table public.credit_notes;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Verification:
--   select * from public.credit_notes
--    where hospital_id = '<your-hospital-id>' order by created_at desc;
-- ---------------------------------------------------------------------
