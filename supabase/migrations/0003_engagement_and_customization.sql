-- ===========================================================================
-- 0003 — Additive columns/tables for: cosmetic customization (territory
-- color, war cry), anonymous session correlation, live engagement counters
-- (visitors/clicks), and per-owner lifetime-plunder aggregation.
--
-- Run after 0002_payment_provider.sql. Every change here is additive:
-- new nullable/defaulted columns, new tables. No existing row is rewritten
-- and no existing behavior changes until the application code in later
-- phases starts reading/writing the new columns.
--
-- finalize_conquest is REPLACED in this migration — its race-guard predicate
-- (`sp.version = led.expected_version and sp.current_price = led.expected_price`)
-- is byte-for-byte unchanged from 0001_init.sql. Diff before merging.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- spots: territory customization + per-spot click counter.
-- ---------------------------------------------------------------------------
alter table public.spots
  add column if not exists color        text,
  add column if not exists war_cry      text,
  add column if not exists click_count  integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'spots_color_hex_chk'
  ) then
    alter table public.spots
      add constraint spots_color_hex_chk
      check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'spots_war_cry_len_chk'
  ) then
    alter table public.spots
      add constraint spots_war_cry_len_chk
      check (war_cry is null or char_length(war_cry) <= 80);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ledger: carry the submitted customization + originating anonymous session
-- through to fulfillment.
-- ---------------------------------------------------------------------------
alter table public.ledger
  add column if not exists session_id text,
  add column if not exists color      text,
  add column if not exists war_cry    text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ledger_color_hex_chk'
  ) then
    alter table public.ledger
      add constraint ledger_color_hex_chk
      check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'ledger_war_cry_len_chk'
  ) then
    alter table public.ledger
      add constraint ledger_war_cry_len_chk
      check (war_cry is null or char_length(war_cry) <= 80);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- activity_feed: carry session_id through so the client can filter "Mine"
-- without ever reading the raw httpOnly cookie value from JS.
-- ---------------------------------------------------------------------------
alter table public.activity_feed
  add column if not exists session_id text;

-- ---------------------------------------------------------------------------
-- boards: denormalized live counters for the header stats bar.
-- ---------------------------------------------------------------------------
alter table public.boards
  add column if not exists visitor_count integer not null default 0,
  add column if not exists click_count   integer not null default 0;

-- ---------------------------------------------------------------------------
-- board_visits: dedup table so VISITORS counts unique sessions, not hits.
-- ---------------------------------------------------------------------------
create table if not exists public.board_visits (
  board_id    uuid not null references public.boards(id) on delete cascade,
  session_id  text not null,
  created_at  timestamptz not null default now(),
  primary key (board_id, session_id)
);

-- ---------------------------------------------------------------------------
-- owner_totals: lifetime plunder per owner_display, per board — backs the
-- World Powers "by lifetime plunder" sort toggle. Deliberately keyed on the
-- free-text owner_display (same identity model the rest of the app already
-- uses for ownership/leaderboards) rather than session_id, since a player's
-- session cookie can change across visits/devices but their chosen empire
-- name is the identity already shown publicly on the map and feed.
-- ---------------------------------------------------------------------------
create table if not exists public.owner_totals (
  board_id          uuid not null references public.boards(id) on delete cascade,
  owner_display     text not null,
  lifetime_plunder  integer not null default 0,
  primary key (board_id, owner_display)
);

-- ===========================================================================
-- FULFILLMENT RPC — replaced to also persist color/war_cry/session_id and
-- upsert owner_totals. The race-guard predicate itself is UNCHANGED from
-- 0001_init.sql; only the winning branch's SET list and one additive
-- statement are new.
-- ===========================================================================
create or replace function public.finalize_conquest(p_ledger_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  led   public.ledger%rowtype;
  sp    public.spots%rowtype;
  ev    text;
  prev  text;
begin
  -- Lock the ledger row; only process a still-pending attempt.
  select * into led from public.ledger where id = p_ledger_id for update;
  if not found then
    return 'lost';
  end if;
  if led.status <> 'pending' then
    -- Already resolved (duplicate webhook) — report the prior outcome.
    return led.status;
  end if;

  -- Lock the target spot.
  select * into sp from public.spots where id = led.spot_id for update;

  -- The race guard: did anything change since checkout? (unchanged from 0001)
  if sp.version = led.expected_version and sp.current_price = led.expected_price then
    prev := sp.owner_display;
    ev := case when prev is null then 'claim' else 'conquer' end;

    update public.spots
       set owner_display = led.owner_display,
           logo_url      = led.logo_url,
           link_url      = led.link_url,
           color         = coalesce(led.color, sp.color),
           war_cry       = led.war_cry,
           current_price = led.amount,
           version       = version + 1,
           times_taken   = times_taken + 1,
           conquered_at  = now()
     where id = sp.id;

    update public.ledger
       set status = 'won', resolved_at = now()
     where id = led.id;

    insert into public.activity_feed
      (board_id, spot_id, type, actor, from_owner, label, amount, session_id)
    values
      (led.board_id, led.spot_id, ev, led.owner_display, prev, sp.label, led.amount, led.session_id);

    insert into public.owner_totals (board_id, owner_display, lifetime_plunder)
    values (led.board_id, led.owner_display, led.amount)
    on conflict (board_id, owner_display)
    do update set lifetime_plunder = public.owner_totals.lifetime_plunder + excluded.lifetime_plunder;

    return 'won';
  else
    -- Beaten to it while the buyer was paying.
    update public.ledger
       set status = 'lost', resolved_at = now()
     where id = led.id;
    return 'lost';
  end if;
end;
$$;

-- ===========================================================================
-- record_visit / record_click — cosmetic-counter RPCs. Same trust boundary
-- as finalize_conquest: locked to service_role, called only from Next.js API
-- routes, never exposed to anon/authenticated directly.
-- ===========================================================================
create or replace function public.record_visit(p_board_id uuid, p_session_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
  inserted  boolean;
begin
  insert into public.board_visits (board_id, session_id)
  values (p_board_id, p_session_id)
  on conflict (board_id, session_id) do nothing;
  get diagnostics inserted = row_count;

  if inserted then
    update public.boards set visitor_count = visitor_count + 1
     where id = p_board_id
     returning visitor_count into new_count;
  else
    select visitor_count into new_count from public.boards where id = p_board_id;
  end if;
  return coalesce(new_count, 0);
end;
$$;

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

revoke execute on function public.record_visit(uuid, text) from public, anon, authenticated;
grant  execute on function public.record_visit(uuid, text) to service_role;
revoke execute on function public.record_click(uuid, text) from public, anon, authenticated;
grant  execute on function public.record_click(uuid, text) to service_role;

-- ===========================================================================
-- RLS for the two new tables.
-- ===========================================================================
alter table public.board_visits enable row level security;
-- No anon/authenticated policy defined -> anon is denied entirely, exactly
-- like ledger/logo_assets/webhook_events. Only service_role (bypasses RLS)
-- and the record_visit RPC (security definer) can touch it.

alter table public.owner_totals enable row level security;
drop policy if exists "owner_totals public read" on public.owner_totals;
create policy "owner_totals public read" on public.owner_totals for select using (true);

-- ===========================================================================
-- REALTIME — add boards so the header VISITORS/CLICKS counters stream live.
-- spots is already published (0001_init.sql), so color/war_cry/click_count
-- ride the existing spots UPDATE stream for free. activity_feed is already
-- published too, so session_id rides along for free as well.
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'boards'
  ) then
    alter publication supabase_realtime add table public.boards;
  end if;
end $$;
