-- =====================================================================
-- Shift Handover — enable live realtime updates
-- Two things are required for supabase.channel().on('postgres_changes')
-- to actually fire for these tables, scoped by hospital_id:
--   1) The table must be in the `supabase_realtime` publication.
--   2) REPLICA IDENTITY must be FULL — otherwise Postgres only sends the
--      primary key on UPDATE/DELETE, so the `hospital_id=eq.<id>` filter
--      the client subscribes with has nothing to match against and the
--      event is silently dropped (INSERT still works either way).
-- Safe to re-run.
-- =====================================================================

alter table public.shift_handovers   replica identity full;
alter table public.handover_patients replica identity full;
alter table public.handover_tasks    replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shift_handovers'
  ) then
    alter publication supabase_realtime add table public.shift_handovers;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'handover_patients'
  ) then
    alter publication supabase_realtime add table public.handover_patients;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'handover_tasks'
  ) then
    alter publication supabase_realtime add table public.handover_tasks;
  end if;
end $$;
