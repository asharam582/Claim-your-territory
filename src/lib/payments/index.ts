import "server-only";
import type { PaymentProvider, ProviderId } from "./types";
import { stripeProvider } from "./stripe";
import { dodoProvider } from "./dodo";

const providers: Record<ProviderId, PaymentProvider> = {
  stripe: stripeProvider,
  dodo: dodoProvider,
};

/** The active provider, chosen by PAYMENT_PROVIDER (defaults to stripe). */
export function activeProvider(): PaymentProvider {
  const id = (process.env.PAYMENT_PROVIDER as ProviderId) || "stripe";
  const p = providers[id];
  if (!p) throw new Error(`Unknown PAYMENT_PROVIDER "${id}" (use "stripe" or "dodo").`);
  return p;
}

/** Look up a provider by URL segment for the webhook route. */
export function providerById(id: string): PaymentProvider | null {
  return providers[id as ProviderId] ?? null;
}

export type { PaymentProvider } from "./types";
