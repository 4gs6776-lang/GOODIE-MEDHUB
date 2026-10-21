-- Fixes: "permission denied for table inventory_items / billable_charges /
-- patient_stock_records" (Postgres 42501) in the Sync queue.
-- This is a missing GRANT (not an RLS problem; RLS errors say "row-level security").
-- RLS policies still decide which rows each user can touch.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.inventory_items       to authenticated;
grant select, insert, update, delete on public.billable_charges      to authenticated;
grant select, insert, update, delete on public.patient_stock_records to authenticated;
-- Also make future tables work by default:
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
