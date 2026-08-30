# Project context — Spot Game Engine

> Paste-ready context for an AI coding assistant (Claude Code / Copilot / Cursor).
> If you're a human, `README.md` is the setup guide and `LEARNING.md` explains
> every concept in depth.

## What this is

A reusable **"pay-to-hold, pay-1.5×-to-steal" money-game engine** — the mechanic
behind warmap.lol / outbid.lol. One engine drives two skins from the same code:

- **`/b/world`** — an interactive world map; every country is a claimable spot.
- **`/b/top`** — a leaderboard of ranked slots.

A **spot** (country or rank) has a price. You **claim** an empty spot at base
price, or **conquer** a held one for `ceil(1.5 × current price)`, rounded up to
the whole dollar. The previous owner is **not** refunded. Your logo/name/link
goes on the spot. Live feed ("War Report"), leaderboard ("World Powers"), and
presence counter make it feel like a live war.

## Stack

- **Next.js 14 (App Router) + TypeScript** on Vercel.
- **Supabase**: Postgres (source of truth), Realtime (live map + feed + presence),
  Storage (logo images), RLS (public read, server-only writes).
- **Payments behind a provider abstraction** — Stripe **or** Dodo Payments,
  chosen by the `PAYMENT_PROVIDER` env var.
- Prices are **integer cents** everywhere; formatted only at display.

## The one thing to never break: concurrency + payment correctness

Two people can try to conquer the same spot at the same instant. The invariant is
**exactly one wins, and only the rightful owner keeps the money.** It's enforced
by **optimistic concurrency control**:

1. `/api/checkout` prices the spot **server-side** (never trusts the client),
   snapshots the spot's `version` + `current_price` into a `ledger` row, and opens
   a provider checkout.
2. The provider webhook (`/api/webhook/[provider]`) is **signature-verified** and
   **deduped** (via `webhook_events`), then calls the Postgres function
   **`finalize_conquest`**, which does a single conditional update:
   `UPDATE spots ... WHERE id = :id AND version = :expected_version`.
   1 row updated → **won**; 0 rows → **lost the race**.
3. Settlement differs per provider (see below).

**When editing anything in the checkout → webhook → finalize path, preserve this
guarantee.** Don't move pricing to the client; don't bypass the version check;
keep the webhook idempotent.

## Payment providers (`src/lib/payments/`)

`PaymentProvider` interface with two implementations selected by `PAYMENT_PROVIDER`:

- **Stripe** (`stripe.ts`) — manual capture: authorize, then **capture winners /
  void losers** (losers are never charged).
- **Dodo** (`dodo.ts`) — no manual capture: charges on `payment.succeeded`, so it
  **refunds losers** of the race. Dynamic price via a single **"Pay What You
  Want"** product whose per-checkout `amount` is overridden. Requires a customer
  **email** at checkout. Webhooks verified with `standardwebhooks`.

Webhook endpoints: `/api/webhook/stripe` and `/api/webhook/dodo`.

## File map

```
supabase/migrations/
  0001_init.sql              tables, RLS, realtime, finalize_conquest + board_stats  ← core
  0002_payment_provider.sql  generic provider columns on ledger
scripts/seed.mjs             seeds world (176 countries) + top-50 leaderboard boards
data/countries.json          countries generated from world-atlas
public/countries-110m.json   map geography (TopoJSON)

src/lib/
  pricing.ts                 requiredPrice() + formatMoney() (pure, shared client+server)
  moderation.ts              pluggable image screening, FAILS CLOSED
  supabase/server.ts         service-role client (server only, bypasses RLS)
  supabase/browser.ts        anon client (browser, realtime)
  stripe.ts                  Stripe client
  payments/                  PaymentProvider abstraction (types, stripe, dodo, index, fulfill)
  types.ts

src/app/
  b/[slug]/page.tsx                server component: fetch board snapshot → BoardView
  api/checkout/route.ts            server-authoritative pricing → provider checkout
  api/webhook/[provider]/route.ts  verify → dedupe → finalize → settle
  api/upload/route.ts              moderated logo upload to Supabase Storage
  api/health/route.ts              config sanity check (no secrets leaked)

src/components/
  BoardView.tsx    client: holds state + realtime, switches skin by board.kind
  WorldMap.tsx     react-simple-maps skin (logos, hover, pan/zoom)
  ListBoard.tsx    leaderboard skin
  SpotModal.tsx    claim/conquer form → checkout
  ActivityFeed.tsx / WorldPowers.tsx / StatsBar (in BoardView)
```

## Running locally

1. `npm install`
2. In Supabase SQL editor, run `0001_init.sql` then `0002_payment_provider.sql`.
3. Create a **public** Storage bucket named `logos`.
4. Copy `.env.example` → `.env.local` and fill it in. Set `PAYMENT_PROVIDER`.
5. `npm run seed` then `npm run dev` (http://localhost:3000).
6. Webhooks need a public URL — run a tunnel with a **reserved** domain
   (`ngrok http 3000 --url=<your-static>.ngrok-free.app`) and point the provider
   webhook at `.../api/webhook/dodo` (or `/stripe`).
7. Sanity-check config at `http://localhost:3000/api/health` before a live payment.

## Conventions & guardrails

- **Money is integer cents.** Never use floats for money.
- **Secrets are server-only** (`import "server-only"`); never reference the
  service-role or provider secret keys from client components.
- **Client picks the *what* (spot id), server decides the *how much*.**
- **Moderation runs before display and fails closed.** Don't add a path that shows
  an unmoderated image.
- **Keep the webhook idempotent** (event dedupe + status-guarded finalize).
- Run `npm run typecheck` and `npm run build` before committing.

## Not built yet (roadmap)

"Conquer the world" whole-map buyout · "you've been conquered" emails ·
auto-generated share cards · moderation review dashboard · seasons/resets ·
optional user accounts/owner dashboards.