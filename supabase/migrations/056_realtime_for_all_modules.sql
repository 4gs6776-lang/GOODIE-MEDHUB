-- =====================================================================
-- GOODIE-MEDHUB — 056_realtime_for_all_modules.sql
-- Adds ALL remaining tables to the supabase_realtime publication + sets
-- replica identity full so UPDATE events include the full row.
--
-- This fixes the "why do I have to refresh before seeing things" issue.
-- Many modules subscribe to realtime via useRealtimeAlert() but the
-- tables they listen to were never added to the publication — so
-- Postgres never broadcast any events.
--
-- Tables added to realtime in this migration:
--   billable_charges, invoices, payments, invoice_items, inventory_items,
--   radiology_scans, appointments, admission_requests, beds, admissions,
--   insurance_claims, patient_drug_charts, patient_stock_records,
--   hospital_expenses, service_catalog, price_lists, price_list_items,
--   hmo_contracts, document_sequences, expense_vendors, hospital_bank_accounts,
--   admission_timeline_events
--
-- SAFE TO RE-RUN.
-- =====================================================================

-- Set replica identity FULL on all tables so UPDATE events include
-- the full row (not just changed columns). This is required for our
-- realtime handlers to read patient_id, status, etc. from the payload.
alter table public.billable_charges          replica identity full;
alter table public.invoices                   replica identity full;
alter table public.payments                   replica identity full;
alter table public.invoice_items              replica identity full;
alter table public.inventory_items            replica identity full;
alter table public.radiology_scans            replica identity full;
alter table public.appointments               replica identity full;
alter table public.admission_requests         replica identity full;
alter table public.beds                       replica identity full;
alter table public.admissions                replica identity full;
alter table public.insurance_claims           replica identity full;
alter table public.patient_drug_charts       replica identity full;
alter table public.patient_stock_records     replica identity full;
alter table public.hospital_expenses          replica identity full;
alter table public.service_catalog           replica identity full;
alter table public.price_lists               replica identity full;
alter table public.price_list_items          replica identity full;
alter table public.hmo_contracts             replica identity full;
alter table public.expense_vendors           replica identity full;
alter table public.hospital_bank_accounts    replica identity full;
alter table public.admission_timeline_events replica identity full;

-- Add each table to the supabase_realtime publication (idempotent)
do $$
declare
  t text;
  tables text[] := array[
    'billable_charges', 'invoices', 'payments', 'invoice_items',
    'inventory_items', 'radiology_scans', 'appointments',
    'admission_requests', 'beds', 'admissions', 'insurance_claims',
    'patient_drug_charts', 'patient_stock_records', 'hospital_expenses',
    'service_catalog', 'price_lists', 'price_list_items', 'hmo_contracts',
    'expense_vendors', 'hospital_bank_accounts', 'admission_timeline_events'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Verification:
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' and schemaname = 'public'
--    order by tablename;
--   -- should return 30+ rows including all the tables listed above
-- ---------------------------------------------------------------------
