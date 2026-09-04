# Spot Game Engine

A reusable **"pay-to-hold, pay-1.5×-to-steal"** engine — the mechanic behind
warmap.lol / outbid.lol / outrank.lol — with two skins from one codebase:

- **`/b/world`** — an interactive **world map**; every country is for sale.
- **`/b/top`** — a **leaderboard** of ranked slots.

Add more boards (either kind) without touching the engine. Built on
**Next.js (App Router) · Supabase (Postgres + Realtime + Storage) · Stripe**.

---

## How the game works

- Every **spot** (a country, or a leaderboard rank) has a price. Unclaimed spots
  cost their base price; held spots cost `ceil(1.5 × current price)`, rounded up
  to the whole dollar.
- You **claim** an empty spot or **conquer** a held one by paying. Your logo,
  name, and link go on it.
- The previous owner **gets nothing back**. Their spot is always for sale over
  their head. That tension is the entire product.
- A live **War Report** feed, a **World Powers** leaderboard, and vanity
  counters (online, plundered, claimed) create the sense of an ongoing war.

---

## The part that matters: correctness under concurrency

Two people can try to conquer the same spot, at the same price, in the same
second. The engine guarantees **exactly one wins and only the winner is charged**:

1. **`/api/checkout`** prices the spot **server-side** (never trusts the client),
   records the spot's `version` + `current_price` at that instant in the
   `ledger`, and opens a Stripe Checkout Session with **manual capture**
   (authorize now, don't charge yet).
2. The buyer authorizes payment. Money is **held, not taken**.
3. **`/api/webhook`** receives `checkout.session.completed`, dedupes on the
   event id, then calls the Postgres function **`finalize_conquest`**, which runs
   one conditional update: *take the spot only if its `version` still matches the
   value captured at checkout.*
4. **Won** → capture the authorization, write the feed row, broadcast over
   Realtime. **Lost the race** → **cancel the authorization** (no charge, no
   refund), and the buyer is told they were beaten to it.

Because the database is the only referee, the map can never be double-sold, and
losers are never charged — no refund churn, no disputes from that path.

---

## Prerequisites

- Node 18+ (built and tested on Node 22).
- A **Supabase** project.
- A **Stripe** account (test mode is fine to start).
- (Recommended) an **OpenAI** API key for image moderation. See the security note.

---

## Setup

### 1. Install

```bash
npm install
cp .env.example .env.local   # then fill in real values
```

### 2. Create the database

In the Supabase dashboard → **SQL Editor**, run **both** migrations in order:
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) then
[`supabase/migrations/0002_payment_provider.sql`](supabase/migrations/0002_payment_provider.sql).
0001 creates every table, the `finalize_conquest` + `board_stats` functions, Row
Level Security (public read, server-only writes), and adds `spots` +
`activity_feed` to the realtime publication. 0002 generalizes the ledger's
payment columns so Stripe and Dodo share one schema.

### 3. Create the logo storage bucket

Supabase dashboard → **Storage** → **New bucket** → name it **`logos`** and mark
it **Public** (must match `SUPABASE_LOGO_BUCKET`).

### 4. Fill in `.env.local`

See `.env.example` for every variable. The essentials:

| Variable | Where it comes from |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys |
| `SUPABASE_SECRET_KEY` | same page — **server secret, never expose** |
| `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | from `stripe listen` (local) or the dashboard webhook (prod) |
| `OPENAI_API_KEY` | optional but recommended — enables logo moderation |

### 5. Seed the boards

```bash
npm run seed
```

Creates the **world map** board (176 countries, USA $25, most $3) and a demo
**Top 50 leaderboard**. Safe to re-run — it never overwrites live spots.

### 6. Run

```bash
npm run dev        # http://localhost:3000
```

In a second terminal, forward Stripe webhooks to your local server:

```bash
stripe listen --forward-to localhost:3000/api/webhook/stripe
```

Copy the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET`, then restart `dev`.
Pay with Stripe's test card `4242 4242 4242 4242`, any future expiry / CVC.

Visit **`/b/world`** (map) or **`/b/top`** (leaderboard).

---

## Deploying to production (Vercel)

1. Push this repo to GitHub and import it into **Vercel**.
2. Add every variable from `.env.local` to the Vercel project's **Environment
   Variables**. Set `NEXT_PUBLIC_SITE_URL` to your real domain.
3. In **Stripe → Developers → Webhooks**, add an endpoint:
   `https://yourdomain.com/api/webhook/stripe`, subscribe to
   `checkout.session.completed` and `checkout.session.expired`, and copy the
   signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Run the SQL migration and `npm run seed` against your production Supabase
project (the seed reads `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY`).
5. Turn on **Stripe Tax** if you want VAT/sales tax handled for you.

---

## Payment providers: Stripe or Dodo

Payments sit behind a small `PaymentProvider` interface (`src/lib/payments/`), so
you can switch rails with one env var. Set **`PAYMENT_PROVIDER=stripe`** or
**`PAYMENT_PROVIDER=dodo`**.

|                        | Stripe                               | Dodo Payments                          |
| ---------------------- | ------------------------------------ | -------------------------------------- |
| Checkout               | Hosted Checkout Session              | Hosted payment link                    |
| Dynamic price          | `price_data.unit_amount`             | "Pay What You Want" product + `amount` |
| Lost-race handling     | **Manual capture → void** (no charge) | **Charge → auto-refund** the loser     |
| Webhook endpoint       | `/api/webhook/stripe`                | `/api/webhook/dodo`                    |
| Signature verification | `stripe.webhooks.constructEvent`     | `standardwebhooks` (id/timestamp/sig)  |

**Important difference:** Stripe authorizes then captures, so a buyer who loses a
race is *never charged*. Dodo has no manual capture, so the engine lets the charge
go through and **issues an immediate refund** to the loser. Same guarantee (only
the rightful owner keeps the money), but the loser briefly sees a charge and
refund, and you eat the processing fees on it. This is the trade-off of the Dodo
rail — see LEARNING.md §16.

### Using Dodo

1. In the Dodo dashboard, create **one product** with **Pay What You Want**
   pricing **enabled**. Copy its id into `DODO_PRODUCT_ID`. The engine sends the
   real per-spot amount as the product-cart `amount`.
2. Set `PAYMENT_PROVIDER=dodo`, `DODO_PAYMENTS_API_KEY`, `DODO_ENVIRONMENT`
   (`test_mode`/`live_mode`), and `DODO_DEFAULT_COUNTRY`.
3. Add a Dodo webhook pointing at `https://yourdomain.com/api/webhook/dodo`,
   subscribe to `payment.succeeded` (and `payment.failed` / `payment.cancelled`),
   and copy the signing secret into `DODO_WEBHOOK_KEY`.
4. Dodo requires a customer **email** at checkout — the claim modal now collects
   one and passes it through.

> There's also an official `@dodopayments/nextjs` adapter that generates the
> webhook handler for you. This project verifies + fulfils manually instead, to
> keep the atomic version-lock fulfillment identical across both providers.

## ⚠️ Before you take real money — read this

This is a working engine, not a turnkey legal business. Three things are on you:

- **Content moderation is non-negotiable.** Uploaded logos are arbitrary images
  shown on a public, viral surface. `src/lib/moderation.ts` screens every image
  *before* it can be used — but **only if `OPENAI_API_KEY` is set**. With no
  provider configured it passes images through and logs a warning. **Never run a
  public board without a moderation provider wired in.** Swap in Hive or AWS
  Rekognition there if you prefer, and add a human review queue for edge cases.
- **Stripe will scrutinize this.** Frame it honestly as a *non-refundable digital
  novelty / ad placement* — not gambling, not an investment. Expect elevated
  chargebacks from outbid users; keep your dispute rate low and talk to Stripe
  before you scale. Have a backup processor in mind.
- **Get a lawyer's read.** Terms of Service (no refunds, "entertainment"),
  privacy policy, a DMCA/abuse contact, EU/UK cooling-off waiver at checkout,
  gambling classification in your target markets, and an 18+ gate. Budget a few
  hours of counsel *before* launch.

None of the above is legal or financial advice.

---

## Project map

```
supabase/migrations/0001_init.sql   Schema, RLS, realtime, finalize_conquest RPC  ← the core
scripts/seed.mjs                    Seeds the world + leaderboard boards
data/countries.json                 176 countries generated from world-atlas
public/countries-110m.json          Map geography (TopoJSON)

src/lib/
  pricing.ts        requiredPrice() + money formatting (pure, shared)
  moderation.ts     pluggable image screening (fails CLOSED)
  stripe.ts         Stripe client
  supabase/         server (service role) + browser (anon) clients
  types.ts

src/lib/payments/       PROVIDER ABSTRACTION
  types.ts              PaymentProvider interface
  stripe.ts             Stripe: manual capture → void losers
  dodo.ts               Dodo: charge → refund losers
  index.ts              activeProvider() by PAYMENT_PROVIDER
  fulfill.ts            shared finalize → settle

src/app/
  b/[slug]/page.tsx            server-fetches a board, renders BoardView
  api/checkout/route.ts        prices server-side, opens provider checkout
  api/webhook/[provider]/route.ts  idempotent fulfillment: finalize → settle
  api/upload/route.ts          moderated logo upload to Supabase Storage

src/components/
  BoardView.tsx     holds state + realtime; switches skin by board.kind
  WorldMap.tsx      react-simple-maps skin (logos, hover, pan/zoom)
  ListBoard.tsx     leaderboard skin
  SpotModal.tsx     claim/conquer form → checkout
  ActivityFeed.tsx  War Report
  WorldPowers.tsx   owner leaderboard
```

## Adding a new board

Insert a row into `boards` (`kind` = `map` or `leaderboard`) and its `spots`
(mirror the patterns in `scripts/seed.mjs`). A `map` board needs spot `key`s that
match your geography's feature ids and a `config.geographyUrl`; a `leaderboard`
board just needs `position`s. No engine code changes required.

## What's included vs. roadmap

**Included:** both skins, the full atomic checkout→capture flow, moderated logo
upload, live feed + leaderboard + presence, seed, RLS, idempotent webhooks,
optional Turnstile bot wall.

**Roadmap (not built):** the "conquer the world" whole-map buyout, "you've been
conquered" emails, auto-generated share cards, a moderation review dashboard,
and seasons/resets. See the architecture blueprint for where these slot in.
