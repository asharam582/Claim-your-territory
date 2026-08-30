-- ===========================================================================
-- 0002 — Generalize the ledger to support multiple payment providers
-- (Stripe and Dodo Payments) behind one abstraction.
-- Run after 0001_init.sql.
-- ===========================================================================

alter table public.ledger
  add column if not exists provider            text not null default 'stripe',
  add column if not exists provider_ref        text,   -- checkout/session id
  add column if not exists provider_payment_id text;   -- capturable/refundable payment id

-- One checkout reference per row (nullable — many rows may briefly have null).
create unique index if not exists ledger_provider_ref_idx
  on public.ledger (provider_ref)
  where provider_ref is not null;

-- Backfill legacy rows that used the Stripe-specific columns.
update public.ledger
   set provider_ref = coalesce(provider_ref, stripe_session),
       provider_payment_id = coalesce(provider_payment_id, stripe_payment_intent)
 where stripe_session is not null;
