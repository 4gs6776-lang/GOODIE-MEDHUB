-- =====================================================================
-- GOODIE-MEDHUB — Row Level Security policies
-- Enforces hospital-scoped data isolation at the database level.
-- Safe to re-run: every statement drops-then-creates.
-- Run this in the Supabase SQL editor (or via `supabase db push`
-- once it's saved as a migration file in supabase/migrations/).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they can read `profiles`
-- without recursively triggering RLS on `profiles` itself)
-- ---------------------------------------------------------------------

create or replace function public.current_hospital_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select hospital_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) = 'owner',
    false
  )
$$;

-- ---------------------------------------------------------------------
-- admission_requests
-- ---------------------------------------------------------------------
alter table public.admission_requests enable row level security;

drop policy if exists "admission_requests_select" on public.admission_requests;
create policy "admission_requests_select" on public.admission_requests
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "admission_requests_insert" on public.admission_requests;
create policy "admission_requests_insert" on public.admission_requests
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "admission_requests_update" on public.admission_requests;
create policy "admission_requests_update" on public.admission_requests
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "admission_requests_delete" on public.admission_requests;
create policy "admission_requests_delete" on public.admission_requests
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- admission_timeline_events
-- ---------------------------------------------------------------------
alter table public.admission_timeline_events enable row level security;

drop policy if exists "admission_timeline_events_select" on public.admission_timeline_events;
create policy "admission_timeline_events_select" on public.admission_timeline_events
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "admission_timeline_events_insert" on public.admission_timeline_events;
create policy "admission_timeline_events_insert" on public.admission_timeline_events
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "admission_timeline_events_update" on public.admission_timeline_events;
create policy "admission_timeline_events_update" on public.admission_timeline_events
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "admission_timeline_events_delete" on public.admission_timeline_events;
create policy "admission_timeline_events_delete" on public.admission_timeline_events
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- admissions
-- ---------------------------------------------------------------------
alter table public.admissions enable row level security;

drop policy if exists "admissions_select" on public.admissions;
create policy "admissions_select" on public.admissions
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "admissions_insert" on public.admissions;
create policy "admissions_insert" on public.admissions
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "admissions_update" on public.admissions;
create policy "admissions_update" on public.admissions
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "admissions_delete" on public.admissions;
create policy "admissions_delete" on public.admissions
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------
alter table public.appointments enable row level security;

drop policy if exists "appointments_select" on public.appointments;
create policy "appointments_select" on public.appointments
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "appointments_insert" on public.appointments;
create policy "appointments_insert" on public.appointments
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "appointments_update" on public.appointments;
create policy "appointments_update" on public.appointments
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "appointments_delete" on public.appointments;
create policy "appointments_delete" on public.appointments
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- beds
-- ---------------------------------------------------------------------
alter table public.beds enable row level security;

drop policy if exists "beds_select" on public.beds;
create policy "beds_select" on public.beds
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "beds_insert" on public.beds;
create policy "beds_insert" on public.beds
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "beds_update" on public.beds;
create policy "beds_update" on public.beds
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "beds_delete" on public.beds;
create policy "beds_delete" on public.beds
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- billable_charges
-- ---------------------------------------------------------------------
alter table public.billable_charges enable row level security;

drop policy if exists "billable_charges_select" on public.billable_charges;
create policy "billable_charges_select" on public.billable_charges
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "billable_charges_insert" on public.billable_charges;
create policy "billable_charges_insert" on public.billable_charges
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "billable_charges_update" on public.billable_charges;
create policy "billable_charges_update" on public.billable_charges
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "billable_charges_delete" on public.billable_charges;
create policy "billable_charges_delete" on public.billable_charges
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- insurance_claims
-- ---------------------------------------------------------------------
alter table public.insurance_claims enable row level security;

drop policy if exists "insurance_claims_select" on public.insurance_claims;
create policy "insurance_claims_select" on public.insurance_claims
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "insurance_claims_insert" on public.insurance_claims;
create policy "insurance_claims_insert" on public.insurance_claims
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "insurance_claims_update" on public.insurance_claims;
create policy "insurance_claims_update" on public.insurance_claims
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "insurance_claims_delete" on public.insurance_claims;
create policy "insurance_claims_delete" on public.insurance_claims
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- inventory_items
-- ---------------------------------------------------------------------
alter table public.inventory_items enable row level security;

drop policy if exists "inventory_items_select" on public.inventory_items;
create policy "inventory_items_select" on public.inventory_items
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "inventory_items_insert" on public.inventory_items;
create policy "inventory_items_insert" on public.inventory_items
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "inventory_items_update" on public.inventory_items;
create policy "inventory_items_update" on public.inventory_items
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "inventory_items_delete" on public.inventory_items;
create policy "inventory_items_delete" on public.inventory_items
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- invoice_items
-- ---------------------------------------------------------------------
alter table public.invoice_items enable row level security;

drop policy if exists "invoice_items_select" on public.invoice_items;
create policy "invoice_items_select" on public.invoice_items
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "invoice_items_insert" on public.invoice_items;
create policy "invoice_items_insert" on public.invoice_items
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "invoice_items_update" on public.invoice_items;
create policy "invoice_items_update" on public.invoice_items
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "invoice_items_delete" on public.invoice_items;
create policy "invoice_items_delete" on public.invoice_items
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------
alter table public.invoices enable row level security;

drop policy if exists "invoices_select" on public.invoices;
create policy "invoices_select" on public.invoices
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "invoices_insert" on public.invoices;
create policy "invoices_insert" on public.invoices
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "invoices_update" on public.invoices;
create policy "invoices_update" on public.invoices
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "invoices_delete" on public.invoices;
create policy "invoices_delete" on public.invoices
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- lab_orders
-- ---------------------------------------------------------------------
alter table public.lab_orders enable row level security;

drop policy if exists "lab_orders_select" on public.lab_orders;
create policy "lab_orders_select" on public.lab_orders
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "lab_orders_insert" on public.lab_orders;
create policy "lab_orders_insert" on public.lab_orders
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "lab_orders_update" on public.lab_orders;
create policy "lab_orders_update" on public.lab_orders
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "lab_orders_delete" on public.lab_orders;
create policy "lab_orders_delete" on public.lab_orders
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- lab_tests
-- ---------------------------------------------------------------------
alter table public.lab_tests enable row level security;

drop policy if exists "lab_tests_select" on public.lab_tests;
create policy "lab_tests_select" on public.lab_tests
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "lab_tests_insert" on public.lab_tests;
create policy "lab_tests_insert" on public.lab_tests
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "lab_tests_update" on public.lab_tests;
create policy "lab_tests_update" on public.lab_tests
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "lab_tests_delete" on public.lab_tests;
create policy "lab_tests_delete" on public.lab_tests
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- medication_administrations
-- ---------------------------------------------------------------------
alter table public.medication_administrations enable row level security;

drop policy if exists "medication_administrations_select" on public.medication_administrations;
create policy "medication_administrations_select" on public.medication_administrations
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "medication_administrations_insert" on public.medication_administrations;
create policy "medication_administrations_insert" on public.medication_administrations
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "medication_administrations_update" on public.medication_administrations;
create policy "medication_administrations_update" on public.medication_administrations
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "medication_administrations_delete" on public.medication_administrations;
create policy "medication_administrations_delete" on public.medication_administrations
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------
alter table public.messages enable row level security;

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "messages_update" on public.messages;
create policy "messages_update" on public.messages
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "messages_delete" on public.messages;
create policy "messages_delete" on public.messages
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- patient_drug_charts
-- ---------------------------------------------------------------------
alter table public.patient_drug_charts enable row level security;

drop policy if exists "patient_drug_charts_select" on public.patient_drug_charts;
create policy "patient_drug_charts_select" on public.patient_drug_charts
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "patient_drug_charts_insert" on public.patient_drug_charts;
create policy "patient_drug_charts_insert" on public.patient_drug_charts
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "patient_drug_charts_update" on public.patient_drug_charts;
create policy "patient_drug_charts_update" on public.patient_drug_charts
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "patient_drug_charts_delete" on public.patient_drug_charts;
create policy "patient_drug_charts_delete" on public.patient_drug_charts
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- patient_stock_records
-- ---------------------------------------------------------------------
alter table public.patient_stock_records enable row level security;

drop policy if exists "patient_stock_records_select" on public.patient_stock_records;
create policy "patient_stock_records_select" on public.patient_stock_records
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "patient_stock_records_insert" on public.patient_stock_records;
create policy "patient_stock_records_insert" on public.patient_stock_records
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "patient_stock_records_update" on public.patient_stock_records;
create policy "patient_stock_records_update" on public.patient_stock_records
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "patient_stock_records_delete" on public.patient_stock_records;
create policy "patient_stock_records_delete" on public.patient_stock_records
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- patient_vitals
-- ---------------------------------------------------------------------
alter table public.patient_vitals enable row level security;

drop policy if exists "patient_vitals_select" on public.patient_vitals;
create policy "patient_vitals_select" on public.patient_vitals
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "patient_vitals_insert" on public.patient_vitals;
create policy "patient_vitals_insert" on public.patient_vitals
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "patient_vitals_update" on public.patient_vitals;
create policy "patient_vitals_update" on public.patient_vitals
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "patient_vitals_delete" on public.patient_vitals;
create policy "patient_vitals_delete" on public.patient_vitals
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- patients
-- ---------------------------------------------------------------------
alter table public.patients enable row level security;

drop policy if exists "patients_select" on public.patients;
create policy "patients_select" on public.patients
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "patients_insert" on public.patients;
create policy "patients_insert" on public.patients
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "patients_update" on public.patients;
create policy "patients_update" on public.patients
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "patients_delete" on public.patients;
create policy "patients_delete" on public.patients
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------
alter table public.payments enable row level security;

drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "payments_insert" on public.payments;
create policy "payments_insert" on public.payments
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "payments_update" on public.payments;
create policy "payments_update" on public.payments
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "payments_delete" on public.payments;
create policy "payments_delete" on public.payments
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- pharmacy_items
-- ---------------------------------------------------------------------
alter table public.pharmacy_items enable row level security;

drop policy if exists "pharmacy_items_select" on public.pharmacy_items;
create policy "pharmacy_items_select" on public.pharmacy_items
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "pharmacy_items_insert" on public.pharmacy_items;
create policy "pharmacy_items_insert" on public.pharmacy_items
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "pharmacy_items_update" on public.pharmacy_items;
create policy "pharmacy_items_update" on public.pharmacy_items
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "pharmacy_items_delete" on public.pharmacy_items;
create policy "pharmacy_items_delete" on public.pharmacy_items
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- pharmacy_orders
-- ---------------------------------------------------------------------
alter table public.pharmacy_orders enable row level security;

drop policy if exists "pharmacy_orders_select" on public.pharmacy_orders;
create policy "pharmacy_orders_select" on public.pharmacy_orders
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "pharmacy_orders_insert" on public.pharmacy_orders;
create policy "pharmacy_orders_insert" on public.pharmacy_orders
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "pharmacy_orders_update" on public.pharmacy_orders;
create policy "pharmacy_orders_update" on public.pharmacy_orders
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "pharmacy_orders_delete" on public.pharmacy_orders;
create policy "pharmacy_orders_delete" on public.pharmacy_orders
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- prescription_templates
-- ---------------------------------------------------------------------
alter table public.prescription_templates enable row level security;

drop policy if exists "prescription_templates_select" on public.prescription_templates;
create policy "prescription_templates_select" on public.prescription_templates
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "prescription_templates_insert" on public.prescription_templates;
create policy "prescription_templates_insert" on public.prescription_templates
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "prescription_templates_update" on public.prescription_templates;
create policy "prescription_templates_update" on public.prescription_templates
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "prescription_templates_delete" on public.prescription_templates;
create policy "prescription_templates_delete" on public.prescription_templates
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- prescriptions
-- ---------------------------------------------------------------------
alter table public.prescriptions enable row level security;

drop policy if exists "prescriptions_select" on public.prescriptions;
create policy "prescriptions_select" on public.prescriptions
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "prescriptions_insert" on public.prescriptions;
create policy "prescriptions_insert" on public.prescriptions
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "prescriptions_update" on public.prescriptions;
create policy "prescriptions_update" on public.prescriptions
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "prescriptions_delete" on public.prescriptions;
create policy "prescriptions_delete" on public.prescriptions
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- radiology_scans
-- ---------------------------------------------------------------------
alter table public.radiology_scans enable row level security;

drop policy if exists "radiology_scans_select" on public.radiology_scans;
create policy "radiology_scans_select" on public.radiology_scans
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "radiology_scans_insert" on public.radiology_scans;
create policy "radiology_scans_insert" on public.radiology_scans
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "radiology_scans_update" on public.radiology_scans;
create policy "radiology_scans_update" on public.radiology_scans
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "radiology_scans_delete" on public.radiology_scans;
create policy "radiology_scans_delete" on public.radiology_scans
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- rosters
-- ---------------------------------------------------------------------
alter table public.rosters enable row level security;

drop policy if exists "rosters_select" on public.rosters;
create policy "rosters_select" on public.rosters
  for select using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "rosters_insert" on public.rosters;
create policy "rosters_insert" on public.rosters
  for insert with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "rosters_update" on public.rosters;
create policy "rosters_update" on public.rosters
  for update using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  ) with check (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "rosters_delete" on public.rosters;
create policy "rosters_delete" on public.rosters
  for delete using (
    hospital_id = public.current_hospital_id() or public.is_owner()
  );

-- ---------------------------------------------------------------------
-- profiles
-- Special-cased: users can always see/edit their own row (needed before
-- they're assigned a hospital_id, e.g. right after signup), staff can see
-- co-workers in the same hospital (roster/staff lists), owners see all.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (
    id = auth.uid()
    or hospital_id = public.current_hospital_id()
    or public.is_owner()
  );

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert with check (
    id = auth.uid()
  );

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (
    id = auth.uid() or public.is_owner()
  ) with check (
    id = auth.uid() or public.is_owner()
  );

drop policy if exists "profiles_delete" on public.profiles;
create policy "profiles_delete" on public.profiles
  for delete using (
    public.is_owner()
  );

-- ---------------------------------------------------------------------
-- hospitals
-- Special-cased: staff can read their own hospital's row (name, settings)
-- but only the platform owner can create/edit/delete hospitals.
-- ---------------------------------------------------------------------
alter table public.hospitals enable row level security;

drop policy if exists "hospitals_select" on public.hospitals;
create policy "hospitals_select" on public.hospitals
  for select using (
    id = public.current_hospital_id() or public.is_owner()
  );

drop policy if exists "hospitals_insert" on public.hospitals;
create policy "hospitals_insert" on public.hospitals
  for insert with check (
    public.is_owner()
  );

drop policy if exists "hospitals_update" on public.hospitals;
create policy "hospitals_update" on public.hospitals
  for update using (
    public.is_owner()
  ) with check (
    public.is_owner()
  );

drop policy if exists "hospitals_delete" on public.hospitals;
create policy "hospitals_delete" on public.hospitals
  for delete using (
    public.is_owner()
  );

-- ---------------------------------------------------------------------
-- roster_entries
-- Special-cased: this table has no hospital_id column of its own — it's
-- a child of `rosters` (via roster_id), so scope it through a join.
-- ---------------------------------------------------------------------
alter table public.roster_entries enable row level security;

drop policy if exists "roster_entries_select" on public.roster_entries;
create policy "roster_entries_select" on public.roster_entries
  for select using (
    public.is_owner() or exists (
      select 1 from public.rosters r
      where r.id = roster_entries.roster_id
        and r.hospital_id = public.current_hospital_id()
    )
  );

drop policy if exists "roster_entries_insert" on public.roster_entries;
create policy "roster_entries_insert" on public.roster_entries
  for insert with check (
    public.is_owner() or exists (
      select 1 from public.rosters r
      where r.id = roster_entries.roster_id
        and r.hospital_id = public.current_hospital_id()
    )
  );

drop policy if exists "roster_entries_update" on public.roster_entries;
create policy "roster_entries_update" on public.roster_entries
  for update using (
    public.is_owner() or exists (
      select 1 from public.rosters r
      where r.id = roster_entries.roster_id
        and r.hospital_id = public.current_hospital_id()
    )
  ) with check (
    public.is_owner() or exists (
      select 1 from public.rosters r
      where r.id = roster_entries.roster_id
        and r.hospital_id = public.current_hospital_id()
    )
  );

drop policy if exists "roster_entries_delete" on public.roster_entries;
create policy "roster_entries_delete" on public.roster_entries
  for delete using (
    public.is_owner() or exists (
      select 1 from public.rosters r
      where r.id = roster_entries.roster_id
        and r.hospital_id = public.current_hospital_id()
    )
  );
