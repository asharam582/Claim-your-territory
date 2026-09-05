-- ===========================================================================
-- 0003a — Tables and columns only (run this FIRST in the Supabase SQL editor)
-- ===========================================================================

-- spots: territory customization + per-spot click counter.
alter table public.spots
  add column if not exists color        text,
  add column if not exists war_cry      text,
  add column if not exists click_count  integer not null default 0;

-- ledger: carry submitted customization + originating anonymous session.
alter table public.ledger
  add column if not exists session_id text,
  add column if not exists color      text,
  add column if not exists war_cry    text;

-- activity_feed: carry session_id for the "Mine" filter.
alter table public.activity_feed
  add column if not exists session_id text;

-- boards: denormalized live counters for the header stats bar.
alter table public.boards
  add column if not exists visitor_count integer not null default 0,
  add column if not exists click_count   integer not null default 0;

-- board_visits: dedup table so VISITORS counts unique sessions, not hits.
create table if not exists public.board_visits (
  board_id    uuid not null references public.boards(id) on delete cascade,
  session_id  text not null,
  created_at  timestamptz not null default now(),
  primary key (board_id, session_id)
);

-- owner_totals: lifetime plunder per owner per board.
create table if not exists public.owner_totals (
  board_id          uuid not null references public.boards(id) on delete cascade,
  owner_display     text not null,
  lifetime_plunder  integer not null default 0,
  primary key (board_id, owner_display)
);
