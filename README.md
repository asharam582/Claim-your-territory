# Claim Your Territory

**Guaranteed-visibility ad space** — a reusable "pay-to-hold, pay-1.5×-to-steal"
placement engine, inspired by the outbid.lol / warmap.lol model. One engine,
two skins from the same codebase:

- **`/b/world`** — an interactive **world map**; every country is a placement.
- **`/b/top`** — a **ranked leaderboard** of numbered slots.

A founder, indie hacker, or brand pays for a spot (a country, or rank #1–50).
Their **logo, name, link, and description** go live on it immediately, seen by
everyone who visits the board. Add more boards (map or leaderboard) without
touching the engine. Built on **Next.js (App Router) · Supabase (Postgres +
Realtime + Storage) · Stripe / Dodo Payments**.

---

## The pitch: guaranteed visibility, not a black box

Google Ads, Product Hunt, and Meta Ads sell you a bid and an algorithm — you
spend money and hope it converts into eyeballs. Nobody can tell you exactly
where or whether you'll be seen.

This sells the opposite: **certainty of position.** Pay $X, own rank #Y (or a
named country), starting now. No auction you can't see, no impression
estimate, no black box — just a spot with your name on it that stays yours
until someone pays more for it.

That mechanic creates its own marketing engine:

- **A live scoreboard is a public theater.** Real-time rank flips, a ticking
  revenue counter, and a visible "who owns what" feed make the board feel
  alive and worth checking — every visit is a chance to see something change.
- **Status is shareable.** Owning the #1 spot (or a big country) is a bragging
  right. A one-click "share my rank" card turns every buyer into a promoter —
  they post it, their audience clicks through, the board gets more valuable,
  and the next buyer pays more. (Not built yet — see [Roadmap](#roadmap).)
- **Upgrading should feel cheap, not like starting over.** A buyer who already
  owns rank #5 shouldn't have to think of moving to #3 as a brand-new
  purchase — see the note on partial-upgrade pricing in the roadmap.

The one structural risk of this model: once the top spot gets expensive
enough, new buyers get priced out and the board goes stale. The roadmap below
has two counters for that — a daily-reset board and niche vertical boards —
so there's always a cheap, relevant entry point.

---

## How placements work

- Every **spot** (a country, or a leaderboard rank) has a price. An unclaimed
  spot costs its base price; a held spot costs `ceil(1.5 × current price)`,
  rounded up to the whole dollar.
- A buyer **claims** an empty spot or **conquers** a held one by paying. Their
  logo, name, link, and description go live on it — instantly, no review
  queue, no ad approval process.
- The previous occupant **gets nothing back**. Their placement is always for
  sale over their head — that's what keeps the board dynamic instead of a
  static, stale directory.
- A live **activity feed**, an **owner leaderboard**, and vanity counters
  (online visitors, dollars moved, spots claimed) make the board feel like a
  live market instead of a spreadsheet.

---

## The part that matters: correctness under concurrency

Two buyers can try to take the same spot, at the same price, in the same
second. The engine guarantees **exactly one wins and only the winner is
charged**:

1. **`/api/checkout`** prices the spot **server-side** (never trusts the
   client), records the spot's `version` + `current_price` at that instant in
   the `ledger`, and opens a Stripe Checkout Session with **manual capture**
   (authorize now, don't charge yet).
2. The buyer authorizes payment. Money is **held, not taken**.
3. **`/api/webhook`** receives `checkout.session.completed`, dedupes on the
   event id, then calls the Postgres function **`finalize_conquest`**, which
   runs one conditional update: *take the spot only if its `version` still
   matches the value captured at checkout.*
4. **Won** → capture the authorization, write the feed row, broadcast over
   Realtime. **Lost the race** → **cancel the authorization** (no charge, no
   refund), and the buyer is told they were beaten to it.

Because the database is the only referee, a spot can never be double-sold, and
losers are never charged — no refund churn, no disputes from that path.

---

## Prerequisites

- Node 18+ (built and tested on Node 22).
- A **Supabase** project.
- A **Stripe** account (test mode is fine to start), or a **Dodo Payments**
  account.
- (Recommended) an **OpenAI** API key for image moderation. See the security
  note.

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
- **Stripe will scrutinize this.** Frame it honestly as *guaranteed digital ad
  placement* — not gambling, not an investment. Expect elevated chargebacks
  from outbid buyers; keep your dispute rate low and talk to Stripe before you
  scale. Have a backup processor in mind.
- **Get a lawyer's read.** Terms of Service (no refunds, "ad placement, not an
  investment"), privacy policy, a DMCA/abuse contact, EU/UK cooling-off waiver
  at checkout, and any ad-disclosure rules in your target markets. Budget a few
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
  ActivityFeed.tsx  live activity feed
  WorldPowers.tsx   owner leaderboard
```

## Adding a new board

Insert a row into `boards` (`kind` = `map` or `leaderboard`) and its `spots`
(mirror the patterns in `scripts/seed.mjs`). A `map` board needs spot `key`s that
match your geography's feature ids and a `config.geographyUrl`; a `leaderboard`
board just needs `position`s. No engine code changes required — this is how
niche vertical boards (see Roadmap) get added.

## What's included vs. roadmap

**Included:** both skins, the full atomic checkout→capture flow, moderated logo
upload, live feed + leaderboard + presence, seed, RLS, idempotent webhooks,
optional Turnstile bot wall.

### Roadmap

Ideas for keeping the board dynamic and lowering the entry barrier as the top
spots get expensive — not built yet, and good places for a first contribution
(see [Contributing](#contributing)):

- **Partial-upgrade pricing** — if a buyer already owns rank #5 and wants #3,
  charge only the difference between what they already paid and the new
  price, instead of the full new price. Lowers the friction to keep spending.
- **`/today` timeboxed board** — a leaderboard that resets at midnight UTC,
  keeping the entry price low ($5–$10) every morning for new buyers.
- **Niche vertical boards** — dedicated boards per category (Dev Tools, AI
  Tools, Indie Games, …) instead of one general leaderboard, so buyers reach
  an audience that actually converts.
- **"Share my rank" card** — an auto-generated, shareable image for X /
  LinkedIn when someone claims a spot, so buyers become the marketing.
- **"You've been outbid" emails**, a moderation review dashboard, and seasons
  / resets for the map board.

See the architecture blueprint / `LEARNING.md` for where these slot into the
existing engine.

---

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for how to
set up the project, coding conventions, and how to submit a pull request.
Issues labeled [`good first issue`](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
are scoped to be self-contained and don't require deep familiarity with the
concurrency/payment core; [`help wanted`](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)
covers larger roadmap items above.
