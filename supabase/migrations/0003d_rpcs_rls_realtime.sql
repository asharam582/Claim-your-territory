-- ===========================================================================
-- 0003d — RPCs, RLS, Realtime (run AFTER 0003a and 0003c)
-- ===========================================================================

-- record_visit: unique visitor counter
create or replace function public.record_visit(p_board_id uuid, p_session_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
  did_insert integer;
begin
  insert into public.board_visits (board_id, session_id)
  values (p_board_id, p_session_id)
  on conflict (board_id, session_id) do nothing;

  get diagnostics did_insert = row_count;

  if did_insert > 0 then
    update public.boards set visitor_count = visitor_count + 1
     where id = p_board_id
     returning visitor_count into new_count;
  else
    select visitor_count into new_count from public.boards where id = p_board_id;
  end if;
  return coalesce(new_count, 0);
end;
$$;

-- record_click: spot + board click counter
create or replace function public.record_click(p_spot_id uuid, p_session_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_board_id uuid;
  new_count  integer;
begin
  update public.spots set click_count = click_count + 1
   where id = p_spot_id
   returning board_id, click_count into v_board_id, new_count;

  if v_board_id is not null then
    update public.boards set click_count = click_count + 1 where id = v_board_id;
  end if;
  return coalesce(new_count, 0);
end;
$$;

-- Lock down RPCs to service_role only (same pattern as finalize_conquest).
revoke execute on function public.record_visit(uuid, text) from public, anon, authenticated;
grant  execute on function public.record_visit(uuid, text) to service_role;
revoke execute on function public.record_click(uuid, text) from public, anon, authenticated;
grant  execute on function public.record_click(uuid, text) to service_role;

-- RLS
alter table public.board_visits enable row level security;

alter table public.owner_totals enable row level security;
drop policy if exists "owner_totals public read" on public.owner_totals;
create policy "owner_totals public read" on public.owner_totals for select using (true);

-- Realtime: add boards table so VISITORS/CLICKS stream live.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'boards'
  ) then
    alter publication supabase_realtime add table public.boards;
  end if;
end $$;
