import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentProvider, WebhookResult } from "./types";

/**
 * Provider-agnostic fulfillment. Given a normalized webhook result, resolve the
 * race in Postgres and settle the payment. Idempotency (event dedupe) is handled
 * by the caller via the webhook_events table.
 */
export async function fulfill(
  db: SupabaseClient,
  provider: PaymentProvider,
  result: WebhookResult,
): Promise<void> {
  if (result.kind === "completed") {
    if (result.paymentId) {
      await db
        .from("ledger")
        .update({ provider_payment_id: result.paymentId })
        .eq("id", result.ledgerId);
    }

    // The single source of truth for who wins the spot.
    const { data: outcome, error } = await db.rpc("finalize_conquest", {
      p_ledger_id: result.ledgerId,
    });
    if (error) throw error;

    if (result.paymentId) {
      // won  -> Stripe captures / Dodo no-ops
      // lost -> Stripe voids the hold / Dodo refunds
      await provider.settle(result.paymentId, outcome === "won" ? "won" : "lost");
    }
  } else if (result.kind === "expired") {
    await db
      .from("ledger")
      .update({ status: "lost", resolved_at: new Date().toISOString() })
      .eq("id", result.ledgerId)
      .eq("status", "pending");
  }
}
