import "server-only";

export type ProviderId = "stripe" | "dodo";
export type Outcome = "won" | "lost";

export interface CheckoutArgs {
  ledgerId: string;
  amount: number; // integer cents
  currency: string;
  productName: string; // e.g. "The World Is For Sale — France"
  description: string; // e.g. "Conquer France from carillon.dev"
  customerEmail?: string; // required by Dodo; optional for Stripe
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  url: string; // hosted checkout URL to redirect to
  ref: string; // provider checkout/session reference
}

export type WebhookResult =
  | { kind: "completed"; eventId: string; ledgerId: string; paymentId: string | null }
  | { kind: "expired"; eventId: string; ledgerId: string }
  | { kind: "ignored" };

/**
 * A payment provider the engine can drive. The atomic race resolution
 * (finalize_conquest) is provider-agnostic; each provider only differs in
 * how a checkout is created, how webhooks are verified, and how a won/lost
 * outcome is SETTLED:
 *   - Stripe uses manual capture  -> capture winners, VOID losers (never charged)
 *   - Dodo charges immediately    -> no-op winners, REFUND losers
 */
export interface PaymentProvider {
  id: ProviderId;
  createCheckout(args: CheckoutArgs): Promise<CheckoutResult>;
  parseWebhook(rawBody: string, headers: Headers): Promise<WebhookResult>;
  settle(paymentId: string, outcome: Outcome): Promise<void>;
}
