import "server-only";
import DodoPayments from "dodopayments";
import { Webhook } from "standardwebhooks";
import type { PaymentProvider, CheckoutArgs, CheckoutResult, WebhookResult, Outcome } from "./types";

function dodoClient() {
  const bearerToken = process.env.DODO_PAYMENTS_API_KEY;
  if (!bearerToken) throw new Error("DODO_PAYMENTS_API_KEY not set.");
  const environment = (process.env.DODO_ENVIRONMENT as "test_mode" | "live_mode") || "test_mode";
  return new DodoPayments({ bearerToken, environment });
}

export const dodoProvider: PaymentProvider = {
  id: "dodo",

  async createCheckout(args: CheckoutArgs): Promise<CheckoutResult> {
    const productId = process.env.DODO_PRODUCT_ID;
    if (!productId) {
      throw new Error(
        "DODO_PRODUCT_ID not set. Create ONE product in Dodo with 'Pay What You Want' pricing enabled and put its id here.",
      );
    }
    // Dodo requires a customer email at payment creation.
    if (!args.customerEmail) {
      throw new Error("An email is required to check out with Dodo Payments.");
    }
    const country = process.env.DODO_DEFAULT_COUNTRY || "US";
    const client = dodoClient();

    // Dynamic price: the product is "Pay What You Want", so the per-item `amount`
    // (in cents) sets what this buyer pays.
    const payment: any = await (client.payments.create as any)({
      payment_link: true,
      customer: { email: args.customerEmail, name: args.customerName || args.customerEmail },
      billing: { country },
      product_cart: [{ product_id: productId, quantity: 1, amount: args.amount }],
      metadata: { ledger_id: args.ledgerId },
      return_url: args.successUrl,
    });

    const url = payment.payment_link || payment.payment_url;
    const ref = payment.payment_id;
    if (!url || !ref) throw new Error("Dodo did not return a payment link.");
    return { url, ref };
  },

  async parseWebhook(rawBody: string, headers: Headers): Promise<WebhookResult> {
    const secret = process.env.DODO_WEBHOOK_KEY;
    if (!secret) throw new Error("DODO_WEBHOOK_KEY not set.");

    // Standard Webhooks signature scheme (id + timestamp + signature).
    const wh = new Webhook(secret);
    wh.verify(rawBody, {
      "webhook-id": headers.get("webhook-id") ?? "",
      "webhook-signature": headers.get("webhook-signature") ?? "",
      "webhook-timestamp": headers.get("webhook-timestamp") ?? "",
    });

    const event = JSON.parse(rawBody) as {
      type?: string;
      data?: { payment_id?: string; metadata?: Record<string, string> };
    };
    const type = event.type;
    const data = event.data ?? {};
    const ledgerId = data.metadata?.ledger_id;
    // Dodo has no separate event id field; the webhook-id header is the unique id.
    const eventId = headers.get("webhook-id") ?? `${data.payment_id ?? "unknown"}:${type}`;

    if (type === "payment.succeeded" && ledgerId) {
      return { kind: "completed", eventId, ledgerId, paymentId: data.payment_id ?? null };
    }
    if ((type === "payment.failed" || type === "payment.cancelled") && ledgerId) {
      return { kind: "expired", eventId, ledgerId };
    }
    return { kind: "ignored" };
  },

  async settle(paymentId: string, outcome: Outcome): Promise<void> {
    // Dodo charges immediately on payment.succeeded (no manual capture).
    // Winner: nothing to do. Loser of the race: refund the full amount.
    if (outcome === "won") return;
    const client = dodoClient();
    try {
      await (client.refunds.create as any)({
        payment_id: paymentId,
        reason: "Spot was taken by another buyer before fulfillment.",
      });
    } catch (err) {
      const msg = (err as { message?: string })?.message?.toLowerCase() || "";
      // Ignore if already refunded (duplicate webhook delivery).
      if (!msg.includes("already") && !msg.includes("refunded")) throw err;
    }
  },
};
