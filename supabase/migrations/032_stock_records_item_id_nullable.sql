-- Pharmacy can dispense drugs that are not in inventory (no item id).
-- Already applied to the live GOODIE SaaS database.
alter table public.patient_stock_records alter column item_id drop not null;
