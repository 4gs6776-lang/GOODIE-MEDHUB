-- =====================================================================
-- 014_rollback.sql — removes EVERYTHING that 014 added.
-- Run this if anything behaves unexpectedly after 014. It only drops the
-- triggers and functions created by 014; no data is touched.
-- Safe to run more than once.
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'admission_requests', 'admission_timeline_events', 'admissions',
    'appointments', 'beds', 'billable_charges',
    'handover_patients', 'handover_tasks', 'insurance_claims',
    'inventory_items', 'invoice_items', 'invoices',
    'lab_orders', 'lab_tests',
    'patient_drug_charts', 'patient_stock_records', 'patients', 'payments',
    'pharmacy_items', 'pharmacy_orders',
    'prescription_templates', 'prescriptions',
    'radiology_scans', 'roster_entries', 'rosters', 'shift_handovers'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_subscription_lock on public.%I', t);
    end if;
  end loop;
end
$$;

drop trigger if exists trg_plan_patient_limit on public.patients;
drop trigger if exists trg_plan_staff_reactivate on public.profiles;

drop function if exists public.enforce_subscription_lock();
drop function if exists public.enforce_plan_patient_limit();
drop function if exists public.enforce_plan_staff_reactivate();
