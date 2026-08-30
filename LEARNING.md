# LEARNING.md — Concepts behind the Spot Game Engine

A guide to everything this project uses, written so you can **explain it in an
interview**. Each concept has: **What**, **Why**, **How (in this codebase)**, an
**Interview soundbite** (one or two sentences to say out loud), and **Likely
follow-up questions**.

Read the ones marked ⭐ first — they're the parts an interviewer will actually
dig into.

---

## 0. The 30-second pitch

> "It's a viral 'money game': a world map where every country is a spot you buy
> with your logo. Anyone can take your spot by paying 1.5× what you paid, and you
> get nothing back. I built it as a reusable engine on Next.js, Supabase, and
> Stripe. The interesting engineering is guaranteeing that when two people try to
> buy the same spot at the same instant, exactly one wins and only that one is
> charged — solved with optimistic concurrency control in Postgres plus
> authorize-then-capture payments."

That single paragraph contains three hooks an interviewer will chase: **the race
condition**, **payment correctness**, and **reusable design**. Everything below
lets you go deep on each.

---

## 1. The mechanic (and why it's viral)

**What.** Every *spot* (a country on a map, or a rank on a leaderboard) has a
price. You *claim* an empty one at its base price, or *conquer* a held one for
`ceil(1.5 × current price)`. The old owner is not refunded.

**Why it works as a product.** The escalating price creates a self-funding
auction with no end. Each owner is *incentivised to promote their own spot*
("come take Brazil from me") because attention raises their status — so the users
do the marketing. The "you lose it with nothing back" rule is what generates
drama and shareable moments.

**Interview soundbite.** "The growth loop is built into the mechanic: owners
advertise their own spots because being contested is the point, so customer
acquisition is baked into the product rather than bolted on."

**Follow-ups.** *Is this gambling?* No — no element of chance and no monetary
prize; you buy a durable ad placement. That distinction matters for payment
processors and the law.

---

## 2. Architecture & why managed services ⭐

**What.** Next.js (UI + API) on Vercel → Supabase (Postgres + Realtime +
Storage) → Stripe (payments). No custom servers.

**Why.** The app is small but must be *correct* and *live*. Managed services
remove the parts that are easy to get wrong (auth, websockets, PCI) so effort
goes into the one thing that's genuinely hard here: concurrent payment
fulfillment. The database is the single source of truth; everything else is a
thin layer around it.

**How.** Read paths are cheap Postgres selects; write paths go through API routes
using a privileged server key; the browser gets live updates over Supabase
Realtime; money moves through Stripe's hosted checkout.

**Interview soundbite.** "I pushed all correctness into Postgres and used managed
services for everything commoditised, so the surface area I had to reason about
carefully was just the checkout-to-fulfillment path."

**Follow-ups.** *Why not a custom Node/WebSocket server?* You could, but you'd own
scaling and reconnection logic that Supabase Realtime already solves; the payoff
isn't worth it until you outgrow it.

---

## 3. Next.js App Router: server vs client components ⭐

**What.** Next.js splits components into **Server Components** (render on the
server, can touch secrets and the DB, ship no JS) and **Client Components**
(`"use client"`, run in the browser, can use state/effects/events).

**Why.** You want the initial board to arrive fully rendered and SEO-friendly
(server), but the map interactions and live updates need the browser (client).

**How in this codebase.**
- `src/app/b/[slug]/page.tsx` is a **Server Component**: it fetches the board,
  spots, feed, and stats with the service-role client and passes them as props.
- `src/components/BoardView.tsx` is a **Client Component**: it holds state,
  subscribes to Realtime, and renders the map/list/modal.
- **Route Handlers** (`src/app/api/*/route.ts`) are server-only HTTP endpoints —
  this is where Stripe and the database live.

**Interview soundbite.** "The page is a Server Component that fetches the initial
snapshot with a privileged key, then hands off to a Client Component that owns
realtime and interactivity — so the first paint is server-rendered and secrets
never reach the browser."

**Follow-ups.** *How do you keep the service-role key out of the client?*
`import "server-only"` on the module, and it's only ever imported by Server
Components and Route Handlers.

---

## 4. Supabase: Postgres, RLS, Realtime, Storage ⭐

**What.** Supabase is managed Postgres plus batteries: **Row Level Security**
(authorization in the database), **Realtime** (change streams + presence over
websockets), **Storage** (S3-like file store), and auto-generated APIs.

**Why.** One platform gives the relational guarantees the race logic needs *and*
the live layer the product needs, without stitching services together.

**How.**
- **Two clients, two privilege levels.** `supabase/server.ts` uses the
  **service-role** key (bypasses RLS, server only). `supabase/browser.ts` uses
  the **anon** key (subject to RLS, safe for the browser).
- **RLS** (`0001_init.sql`): `spots`, `boards`, `activity_feed` are
  publicly *readable* (`for select using (true)`); no table is publicly
  *writable*. Every write goes through an API route with the service role. The
  `ledger` and `logo_assets` tables have no anon policy at all, so the browser
  can't read them.

**Interview soundbite.** "Authorization lives in the database via Row Level
Security, so even if someone hit the auto-generated API with the public key
directly, they could read the board but never write to it or read the ledger."

**Follow-ups.** *Why is the service role safe?* It's only used server-side inside
route handlers; it's never shipped to the client and it's not the anon key.

---

## 5. ⭐⭐ The concurrency problem & Optimistic Concurrency Control

**This is the star of the project. Be able to draw it.**

**What (the problem).** Two buyers try to conquer France at $57 at the same
moment. Naively — read owner, then write new owner — both reads see $57, both
writes "succeed", and you've sold one country to two people (a lost update / race
condition). With money attached, that's a refund and an angry user.

**Why the obvious fixes fall short.** A read-modify-write in application code has
a gap between read and write. Locking the row for the whole payment (seconds) is
a disaster — payments are slow and you'd serialize the whole site.

**How I solved it — Optimistic Concurrency Control (OCC) with a version column.**
- Every `spots` row has a `version` integer.
- At **checkout**, I record the spot's *current* `version` in the `ledger`
  (`expected_version`). I do **not** lock anything.
- At **fulfillment** (after payment), a single conditional SQL statement runs:

  ```sql
  UPDATE spots
     SET owner = :new, current_price = :paid, version = version + 1, ...
   WHERE id = :id AND version = :expected_version;   -- the guard
  ```
- If `version` still matches → the update affects **1 row** → this buyer wins.
- If someone else already conquered it, `version` moved → **0 rows** → this buyer
  lost the race. No lock held during payment; the database arbitrates atomically
  at the last instant.

In this repo the whole thing lives in the Postgres function
**`finalize_conquest`** (`0001_init.sql`), which also flips the ledger to
`won`/`lost` and writes the feed row inside one transaction.

**Interview soundbite.** "I used optimistic concurrency control: each spot has a
version, I snapshot it at checkout, and fulfillment only commits if the version
hasn't changed — so concurrent buyers resolve to exactly one winner via a single
atomic conditional update, with no long-held locks."

**Follow-ups you should be ready for.**
- *Optimistic vs pessimistic?* Pessimistic (SELECT … FOR UPDATE for the whole
  flow) would hold a lock across the slow payment step; optimistic assumes
  conflicts are rare and only pays a cost when they actually happen — right for a
  web payment flow.
- *What about the loser's money?* See §6 — with Stripe manual capture they're
  never charged; with the Dodo provider they're charged then auto-refunded.
- *Could two updates both see version N?* No — the `WHERE version = N` guard plus
  Postgres row locking during the UPDATE means the first commit bumps it to N+1
  and the second matches zero rows.

---

## 6. ⭐ Authorize-then-capture (why losers aren't charged)

**What.** Stripe payments can **authorize** (place a hold) now and **capture**
(actually take the money) later — "manual capture".

**Why.** Because payment is slow and the race is decided *after* payment, I don't
want to charge someone who turns out to have lost. Authorize first, decide the
winner, then capture only the winner and **void** (cancel) the loser's hold.
Voiding costs nothing and never appears as a charge — far cleaner than charging
everyone and refunding losers.

**How.** `api/checkout` creates the session with
`payment_intent_data.capture_method = "manual"`. The webhook calls
`finalize_conquest`; on `won` it calls `paymentIntents.capture`, on `lost` it
calls `paymentIntents.cancel`. Both are wrapped to ignore "already resolved"
errors for safety.

**Interview soundbite.** "Payment is authorized but not captured until the
database confirms the buyer actually won the spot; the loser's authorization is
voided, so they're never charged and there's no refund churn."

**Follow-ups.** *What if capture never runs (server dies)?* Uncaptured
authorizations expire automatically (about 7 days for cards), so the worst case
self-heals. *Not all methods support manual capture* — that's why checkout is
pinned to cards.

---

## 7. ⭐ Webhooks & idempotency (exactly-once fulfillment)

**What.** The source of truth for "payment happened" is a **webhook** the payment
provider POSTs to my server — never the browser redirect (which the user can
close or fake).

**Why.** The browser can't be trusted to confirm payment. And providers
**retry** webhooks and can deliver the same event twice, so fulfillment must be
**idempotent** — running it twice must equal running it once.

**How.**
- **Signature verification.** The raw request body is verified against a signing
  secret (`webhooks.constructEvent` for Stripe; the `standardwebhooks` package
  for Dodo). An unsigned/forged request is rejected — otherwise anyone could POST
  "payment succeeded" and steal spots for free.
- **Deduplication.** I insert the event id into a `webhook_events` table with a
  primary-key constraint. A duplicate delivery hits a unique violation and
  short-circuits with `200`.
- **Idempotent core.** `finalize_conquest` checks the ledger status first, so
  even if it *is* called twice it won't double-apply.

**Interview soundbite.** "Fulfillment is driven by a signature-verified webhook,
made exactly-once by recording each event id as a primary key and by a
status-guarded fulfillment function — provider retries and duplicate deliveries
are harmless."

**Follow-ups.** *Why verify the signature?* Without it, the endpoint is a
free-spot generator. *Why raw body?* Signature is computed over the exact bytes;
parsing first would change them.

---

## 8. Atomic transactions & the Postgres function (SECURITY DEFINER)

**What.** `finalize_conquest` does four things — check the version, update the
spot, update the ledger, insert the feed row — inside **one transaction**. Either
all happen or none do.

**Why.** If the spot updated but the ledger didn't, you'd have an owner with no
record of payment, or a feed entry for a sale that didn't commit. Atomicity keeps
these consistent.

**How.** It's a PL/pgSQL function. `SECURITY DEFINER` means it runs with the
function owner's privileges (so it can write regardless of caller), and
`set search_path` hardens it against search-path attacks. Execute permission is
**revoked from anon** and granted only to the service role.

**Interview soundbite.** "The whole state transition is one Postgres function in a
single transaction, locked down to server-side callers, so the spot, the ledger,
and the activity feed can never disagree."

---

## 9. Realtime: change streams & presence

**What.** The live map, the "War Report" feed, and the "88 online" counter.

**Why.** The product's energy comes from watching conquests happen live without
refreshing.

**How.** `BoardView` opens a Supabase Realtime channel and subscribes to
`postgres_changes` on `spots` and `activity_feed` (filtered by board), patching
local state as rows change. **Presence** tracks a random key per browser tab; the
count of present keys is the "online" number. Realtime respects RLS, so clients
only receive rows they're allowed to read.

**Interview soundbite.** "Every committed spot change is broadcast over Postgres
change-data-capture to subscribed browsers, and a presence channel gives the live
online count without any database writes."

**Follow-ups.** *Scale?* A single connection cap is fine for launch; a viral
spike beyond it means moving the feed to one fan-out broadcast or a CDN-cached
snapshot. Name the bottleneck; don't pretend it's infinite.

---

## 10. Content moderation (fail-closed) ⭐

**What.** Uploaded logos are arbitrary user images shown on a public, viral
surface, so each one is screened *before* it can appear.

**Why.** Without it you will eventually host hate symbols, porn, or worse, plus
trademark problems — a legal and PR disaster.

**How.** `api/upload` stores the image, runs `moderateImage`, and **deletes it
and rejects if the verdict isn't clean**. `checkout` then re-checks that the logo
was an approved asset, so the moderation step can't be bypassed by calling
checkout directly. Crucially the moderator **fails closed**: if the provider is
down, the image is *not* approved.

**Interview soundbite.** "Moderation runs before display and fails closed, and the
checkout endpoint independently verifies the logo was approved — so there's no
path to putting an unscreened image on the map."

---

## 11. Money as integer cents (never floats)

**What.** All prices are integers in the smallest currency unit (cents).

**Why.** Floating point can't represent money exactly (`0.1 + 0.2 !== 0.3`).
Integers avoid rounding bugs and are what payment APIs expect.

**How.** `base_price`/`current_price`/`amount` are integer cents; `formatMoney`
converts to a display string only at the edge.

**Interview soundbite.** "Money is integer cents end to end; I only convert to a
decimal string for display."

---

## 12. Security posture (the checklist)

- **Secrets never reach the browser** — `server-only`, service-role and payment
  secret keys live only in route handlers.
- **Server-authoritative pricing** — the client sends *which* spot, never the
  price. `api/checkout` computes the amount from the DB, so a tampered client
  can't buy a $57 country for $1.
- **RLS** — public read, no public write; ledger unreadable by the client.
- **Webhook signatures** — forged "payment succeeded" calls are rejected.
- **Input sanitization** — display names are length-capped and stripped of
  control chars; links must be valid `http(s)` URLs.
- **Bot wall** — optional Cloudflare Turnstile on checkout to blunt card-testing.

**Interview soundbite.** "The two rules I never break: the client chooses the
*what*, the server decides the *how much*; and nothing the client says about
payment is trusted without a signed webhook."

---

## 13. Data modeling: the ledger as audit trail

**What.** Every checkout attempt is a `ledger` row (`pending` → `won`/`lost`/
`refunded`), separate from the mutable `spots` state.

**Why.** `spots` tells you *who owns what now*; the ledger is the *immutable
history* — every attempt, what was expected, what was paid, how it resolved. It's
your source of truth for revenue, disputes, and debugging, and it's what makes
fulfillment idempotent (via the unique provider reference).

**Interview soundbite.** "I separated current state from an append-only ledger, so
the map is fast to read while every financial event stays auditable and
idempotent."

---

## 14. Reusability: one engine, two skins

**What.** A `boards` row has a `kind` (`map` | `leaderboard`); `spots` are
generic. The *engine* (pricing, checkout, fulfillment, realtime) is identical for
both; only the rendering differs (`WorldMap` vs `ListBoard`).

**Why.** The whole category (warmap, outbid, outrank, topapp…) is the *same
mechanic* with different presentation. Modelling the mechanic once lets you launch
any of them by inserting rows, not writing code.

**Interview soundbite.** "I factored the mechanic out from the presentation, so a
map board and a leaderboard board are the same engine with a different
component — new variants are data, not new code."

---

## 15. Trade-offs & what I'd do next (say this unprompted)

Interviewers love hearing you name your own limitations:
- **Realtime scale ceiling** — fine for launch, needs a fan-out/CDN layer for a
  massive spike.
- **Refund-based race handling on some providers** (see the Dodo section) charges
  losers then refunds — worse UX than manual capture; a trade-off of that
  provider.
- **No accounts by default** — identity is just the logo/name you paid to show;
  add auth if you want owner dashboards.
- **Moderation needs a human review queue** for edge cases, not just the
  automated pass.

---

## 16. ⭐ Payment provider abstraction (Stripe + Dodo)

**What.** Payments sit behind a single `PaymentProvider` interface
(`src/lib/payments/`). One env var, `PAYMENT_PROVIDER`, chooses **Stripe** or
**Dodo Payments** at runtime. The race resolution (`finalize_conquest`) is
identical for both; only three things differ per provider: how a checkout is
created, how a webhook is verified, and how a won/lost outcome is *settled*.

**Why (the design principle).** This is the **Strategy pattern** /
**dependency inversion**: the engine depends on an abstraction, not on Stripe.
Swapping payment rails — a real business need, e.g. if Stripe freezes you — becomes
a config change plus one new file, not a rewrite. It also forced a clean seam:
everything provider-specific is isolated, everything else is provider-agnostic.

**How.**
```ts
interface PaymentProvider {
  createCheckout(args): Promise<{ url; ref }>;   // open hosted checkout
  parseWebhook(rawBody, headers): Promise<Result>; // verify + normalize event
  settle(paymentId, outcome): Promise<void>;     // finish the money movement
}
```
`activeProvider()` returns the configured one; the webhook route
`/api/webhook/[provider]` looks the provider up by URL segment. The shared
`fulfill()` calls `finalize_conquest` then `provider.settle(...)`.

**The key difference — and it's an interview-worthy point.**
Stripe supports **authorize-then-capture**, so losers are *voided* (never
charged). **Dodo has no manual capture** — it charges immediately on
`payment.succeeded`. So the Dodo strategy implements the *same guarantee* a
different way: **let the charge land, then auto-refund the loser** of the race.
Same invariant ("only the rightful owner keeps the money"), different mechanism,
different trade-off (the loser briefly sees a charge + refund, and you pay the
processing fee on it).

**Two more provider-specific wrinkles worth mentioning:**
- **Dynamic pricing.** Stripe takes an arbitrary `unit_amount` per checkout. Dodo
  charges from *pre-created products*, so to charge a different price per spot I
  use one product with **"Pay What You Want"** enabled and pass the real amount
  as the cart item's `amount`. Recognising that mismatch is the kind of
  integration detail interviewers like.
- **Webhook verification.** Stripe has its own signing scheme; Dodo uses the
  open **Standard Webhooks** spec (`webhook-id` + `webhook-timestamp` +
  `webhook-signature`), verified with the `standardwebhooks` library. I unified
  both under `parseWebhook`, and dedupe on a `provider:eventId` key.

**Interview soundbite.** "I put payments behind a provider interface so the engine
is rail-agnostic. Stripe voids losers via manual capture; Dodo, which has no
manual capture, achieves the same guarantee by refunding losers instead — the
abstraction hides the mechanism but I made the trade-off explicit."

**Follow-ups.**
- *Why not just use one provider?* Payment-processor risk is real for this kind of
  product; being able to fail over is a resilience feature, not gold-plating.
- *How do you avoid double-refunds on Dodo?* Same idempotency: event dedupe plus a
  status-guarded ledger, and the refund call ignores "already refunded" errors.

---

## Quick glossary (for rapid-fire questions)

- **Race condition / lost update** — two writers based on the same read; one
  silently overwrites the other.
- **Optimistic concurrency control** — detect conflicts with a version check
  instead of locking; retry/abort on conflict.
- **Idempotency** — doing it twice equals doing it once.
- **Authorize vs capture** — hold funds vs actually take them.
- **Webhook** — a server-to-server callback; the trustworthy signal that payment
  happened.
- **RLS** — authorization enforced by the database per row.
- **CDC / change data capture** — streaming row changes to subscribers (Realtime).
- **Fail closed** — on error, deny rather than allow (used for moderation).
