import "server-only";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import type { PaymentProvider, CheckoutArgs, CheckoutResult, WebhookResult, Outcome } from "./types";

function isAlreadyResolved(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const msg = (e?.message || "").toLowerCase();
  return (
    e?.code === "payment_intent_unexpected_state" ||
    msg.includes("already been captured") ||
    msg.includes("already canceled") ||
    msg.includes("cannot capture")
  );
}

export const stripeProvider: PaymentProvider = {
  id: "stripe",

  async createCheckout(args: CheckoutArgs): Promise<CheckoutResult> {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      // Manual capture: authorize now, capture only if they still win.
      payment_intent_data: {
        capture_method: "manual",
        metadata: { ledger_id: args.ledgerId },
      },
      customer_email: args.customerEmail,
      client_reference_id: args.ledgerId,
      metadata: { ledger_id: args.ledgerId },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: args.currency,
            unit_amount: args.amount,
            product_data: { name: args.productName, description: args.description },
          },
        },
      ],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
    });
    return { url: session.url ?? "", ref: session.id };
  },

  async parseWebhook(rawBody: string, headers: Headers): Promise<WebhookResult> {
    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET not set.");
    const sig = headers.get("stripe-signature") ?? "";
    const event = stripe.webhooks.constructEvent(rawBody, sig, secret);

    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      const ledgerId = (s.metadata?.ledger_id || s.client_reference_id) as string | undefined;
      const paymentId = typeof s.payment_intent === "string" ? s.payment_intent : null;
      if (ledgerId) return { kind: "completed", eventId: event.id, ledgerId, paymentId };
    } else if (event.type === "checkout.session.expired") {
      const s = event.data.object as Stripe.Checkout.Session;
      const ledgerId = (s.metadata?.ledger_id || s.client_reference_id) as string | undefined;
      if (ledgerId) return { kind: "expired", eventId: event.id, ledgerId };
    }
    return { kind: "ignored" };
  },

  async settle(paymentId: string, outcome: Outcome): Promise<void> {
    const stripe = getStripe();
    try {
      if (outcome === "won") await stripe.paymentIntents.capture(paymentId);
      else await stripe.paymentIntents.cancel(paymentId); // void the hold, no charge
    } catch (err) {
      if (!isAlreadyResolved(err)) throw err;
    }
  },
};
