-- ===========================================================================
-- Spot Game Engine — schema, security, realtime, and the atomic fulfillment RPC
-- ---------------------------------------------------------------------------
-- Run this in the Supabase SQL editor (or via the Supabase CLI) once per
-- project. It is idempotent-ish: safe to read, but intended for a fresh DB.
-- ===========================================================================

-- gen_random_uuid() is available in Supabase by default (pgcrypto).

-- ---------------------------------------------------------------------------
-- boards: one biddable surface. kind = 'map' (countries) or 'leaderboard'.
-- ---------------------------------------------------------------------------
create table if not exists public.boards (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  kind        text not null check (kind in ('map', 'leaderboard')),
  multiplier  numeric not null default 1.5 check (multiplier > 1),
  currency    text not null default 'usd',
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- spots: an individual claimable item on a board.
--   key      -> map: ISO numeric country id; leaderboard: slot index as text
--   position -> leaderboard rank ordering (null for map)
--   All prices are integer CENTS.
-- ---------------------------------------------------------------------------
create table if not exists public.spots (
  id             uuid primary key default gen_random_uuid(),
  board_id       uuid not null references public.boards(id) on delete cascade,
  key            text not null,
  label          text not null,
  base_price     integer not null check (base_price >= 50),
  current_price  integer not null,
  owner_display  text,
  logo_url       text,
  link_url       text,
  version        integer not null default 0,
  position       integer,
  times_taken    integer not null default 0,
  conquered_at   timestamptz,
  unique (board_id, key)
);
create index if not exists spots_board_idx on public.spots (board_id);
create index if not exists spots_board_pos_idx on public.spots (board_id, position);

-- ---------------------------------------------------------------------------
-- ledger: one row per checkout attempt. The unique stripe_session +
-- webhook_events table together make fulfillment exactly-once.
--   expected_version / expected_price capture the state at checkout time so
--   the webhook can detect "someone beat you to it".
-- ---------------------------------------------------------------------------
create table if not exists public.ledger (
  id                    uuid primary key default gen_random_uuid(),
  board_id              uuid not null references public.boards(id) on delete cascade,
  spot_id               uuid not null references public.spots(id) on delete cascade,
  stripe_session        text unique,
  stripe_payment_intent text,
  amount                integer not null,
  expected_version      integer not null,
  expected_price        integer not null,
  owner_display         text not null,
  logo_url              text,
  link_url              text,
  status                text not null default 'pending'
                          check (status in ('pending', 'won', 'lost', 'refunded')),
  created_at            timestamptz not null default now(),
  resolved_at           timestamptz
);
create index if not exists ledger_spot_idx on public.ledger (spot_id);

-- ---------------------------------------------------------------------------
-- activity_feed: the "War Report" stream.
-- ---------------------------------------------------------------------------
create table if not exists public.activity_feed (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.boards(id) on delete cascade,
  spot_id     uuid not null references public.spots(id) on delete cascade,
  type        text not null check (type in ('claim', 'conquer')),
  actor       text not null,
  from_owner  text,
  label       text not null,
  amount      integer not null,
  created_at  timestamptz not null default now()
);
create index if not exists feed_board_time_idx on public.activity_feed (board_id, created_at desc);

-- ---------------------------------------------------------------------------
-- logo_assets: uploaded images + moderation verdict.
-- ---------------------------------------------------------------------------
create table if not exists public.logo_assets (
  id            uuid primary key default gen_random_uuid(),
  storage_path  text not null,
  public_url    text not null,
  mod_status    text not null default 'pending'
                  check (mod_status in ('pending', 'ok', 'blocked')),
  mod_scores    jsonb,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- webhook_events: Stripe delivers events more than once. Insert-or-skip here.
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_events (
  event_id      text primary key,
  processed_at  timestamptz not null default now()
);

-- ===========================================================================
-- FULFILLMENT RPC — the single source of truth for who wins a spot.
-- Called by the Stripe webhook AFTER payment authorization succeeds.
-- Returns 'won' or 'lost'. Runs the conditional update inside one statement
-- so two concurrent conquests can never both succeed.
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

  -- The race guard: did anything change since checkout?
  if sp.version = led.expected_version and sp.current_price = led.expected_price then
    prev := sp.owner_display;
    ev := case when prev is null then 'claim' else 'conquer' end;

    update public.spots
       set owner_display = led.owner_display,
           logo_url      = led.logo_url,
           link_url      = led.link_url,
           current_price = led.amount,
           version       = version + 1,
           times_taken   = times_taken + 1,
           conquered_at  = now()
     where id = sp.id;

    update public.ledger
       set status = 'won', resolved_at = now()
     where id = led.id;

    insert into public.activity_feed
      (board_id, spot_id, type, actor, from_owner, label, amount)
    values
      (led.board_id, led.spot_id, ev, led.owner_display, prev, sp.label, led.amount);

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

-- ---------------------------------------------------------------------------
-- Lightweight per-board stats for the vanity counters.
-- ---------------------------------------------------------------------------
create or replace function public.board_stats(p_board_id uuid)
returns table (claimed_count bigint, total_spots bigint, total_plundered bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.spots s where s.board_id = p_board_id and s.owner_display is not null),
    (select count(*) from public.spots s where s.board_id = p_board_id),
    (select coalesce(sum(l.amount), 0) from public.ledger l where l.board_id = p_board_id and l.status = 'won');
$$;

-- ===========================================================================
-- ROW LEVEL SECURITY
--   Public (anon) may READ the board, spots, and feed. Nothing else.
--   All writes happen through API routes using the service role, which
--   bypasses RLS. finalize_conquest is locked to the service role.
-- ===========================================================================
alter table public.boards        enable row level security;
alter table public.spots         enable row level security;
alter table public.activity_feed enable row level security;
alter table public.ledger        enable row level security;
alter table public.logo_assets   enable row level security;
alter table public.webhook_events enable row level security;

drop policy if exists "boards public read" on public.boards;
create policy "boards public read" on public.boards for select using (true);

drop policy if exists "spots public read" on public.spots;
create policy "spots public read" on public.spots for select using (true);

drop policy if exists "feed public read" on public.activity_feed;
create policy "feed public read" on public.activity_feed for select using (true);
-- ledger / logo_assets / webhook_events: no policies => anon denied entirely.

-- Lock the fulfillment RPC to server-side callers only.
revoke execute on function public.finalize_conquest(uuid) from public, anon, authenticated;
grant  execute on function public.finalize_conquest(uuid) to service_role;
-- board_stats is read-only and safe to expose.
grant  execute on function public.board_stats(uuid) to anon, authenticated, service_role;

-- ===========================================================================
-- REALTIME — publish spot and feed changes so every viewer sees live updates.
-- ===========================================================================
alter publication supabase_realtime add table public.spots;
alter publication supabase_realtime add table public.activity_feed;
