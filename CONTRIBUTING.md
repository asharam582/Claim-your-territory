# Contributing

Thanks for taking a look. This is a small project with one hard rule (see
below) and otherwise a lot of room for improvement — README says what's built
and what's on the [roadmap](README.md#roadmap).

## Before you start

1. Read [`README.md`](README.md) for setup, and [`CLAUDE.md`](CLAUDE.md) for a
   condensed architecture map if you're pairing with an AI assistant.
2. Get it running locally (`README.md` → **Setup**). You'll need a free
   Supabase project and a Stripe test-mode account; both take a few minutes.
3. Pick an issue. If nothing's filed for what you want to do, open one first
   and describe the change — saves both of us a wasted PR.

## The one rule that isn't negotiable

**Never break correctness under concurrency.** Two people can try to take the
same spot at the same instant; the engine guarantees exactly one wins and only
the winner is charged (see README → *The part that matters*). If your change
touches `api/checkout`, `api/webhook/[provider]`, `finalize_conquest`, or
anything in `src/lib/payments/`:

- Pricing stays **server-side** — never trust a price or spot state the client
  sends.
- Don't remove or weaken the `version` check in `finalize_conquest`.
- Keep the webhook **idempotent** (it must be safe to receive the same event
  twice).

Everything else is fair game.

## Good first issues

Look for the [`good first issue`](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
label. These are scoped to not require touching the checkout/webhook path —
think UI, copy, a new board config, small bugs, docs. Examples of the kind of
thing that fits here:

- Fix a visual bug or a responsive-layout issue.
- Add a new leaderboard/map board via `scripts/seed.mjs` (no engine changes
  needed — see README → *Adding a new board*).
- Improve an error message, empty state, or loading state.
- Add a test for `src/lib/pricing.ts` or another pure function.
- Fix a typo or gap in the docs.

[`help wanted`](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)
covers bigger roadmap items (partial-upgrade pricing, the `/today` timeboxed
board, "share my rank" cards, niche vertical boards) — read the linked issue
for context before starting, since these usually touch pricing or schema.

## Making a change

```bash
npm install
npm run typecheck   # must pass
npm run build       # must pass
```

Run both before opening a PR — CI will run them too, but catching it locally
is faster for everyone.

- Keep **money in integer cents**, never floats.
- Match the existing code style (see nearby files) rather than introducing a
  new pattern.
- Small, focused PRs review faster than large ones. If a change grew into
  something bigger than the issue described, say so in the PR description.

## Pull requests

1. Fork, branch off `Main`, and keep the branch name descriptive
   (`fix/logo-upload-error`, `feat/today-board`).
2. Reference the issue you're closing (`Closes #123`).
3. Describe **what changed and why** — screenshots for anything visual.
4. One reviewer approval before merge. Be patient; this is maintained
   part-time.

## Reporting bugs / requesting features

Open an issue. For bugs, include: what you expected, what happened, and
repro steps. For features, a short description of the use case is more useful
than a full spec — we'll figure out the design together in the issue thread.

## Code of conduct

Be respectful, assume good faith, keep feedback about the code. That's it.
