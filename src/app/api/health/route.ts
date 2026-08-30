import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — quick pre-flight check.
 * Verifies that every env var the active payment provider needs is present
 * and that Supabase is reachable. Returns exact errors so you can fix them
 * before wasting time on a test checkout.
 */
export async function GET() {
  const errors: string[] = [];
  const info: Record<string, string> = {};

  // --- Supabase ---
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbPublishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const sbSecret = process.env.SUPABASE_SECRET_KEY;

  if (!sbUrl) errors.push("NEXT_PUBLIC_SUPABASE_URL is missing.");
  if (!sbPublishable) errors.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing.");
  if (!sbSecret) errors.push("SUPABASE_SECRET_KEY is missing.");

  if (sbUrl) {
    info.supabase_url = sbUrl;
    // Quick connectivity check — query an actual table, not the bare root
    try {
      const key = sbSecret || sbPublishable || "";
      const res = await fetch(`${sbUrl}/rest/v1/boards?select=id&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      info.supabase_reachable = res.ok ? "yes" : `no (HTTP ${res.status})`;
    } catch (err) {
      info.supabase_reachable = "no (fetch failed)";
      errors.push(`Supabase unreachable: ${(err as Error).message}`);
    }
  }

  // --- Payment provider ---
  const provider = process.env.PAYMENT_PROVIDER || "stripe";
  info.payment_provider = provider;

  if (provider === "dodo") {
    if (!process.env.DODO_PAYMENTS_API_KEY) errors.push("DODO_PAYMENTS_API_KEY is missing.");
    if (!process.env.DODO_PRODUCT_ID) errors.push("DODO_PRODUCT_ID is missing.");
    if (!process.env.DODO_WEBHOOK_KEY) errors.push("DODO_WEBHOOK_KEY is missing — webhook signature verification will fail.");
    info.dodo_environment = process.env.DODO_ENVIRONMENT || "(not set, defaults to test_mode)";
    info.dodo_product_id = process.env.DODO_PRODUCT_ID || "(missing)";
    info.dodo_default_country = process.env.DODO_DEFAULT_COUNTRY || "(not set, defaults to US)";
  } else if (provider === "stripe") {
    if (!process.env.STRIPE_SECRET_KEY) errors.push("STRIPE_SECRET_KEY is missing.");
    if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) errors.push("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing.");
    if (!process.env.STRIPE_WEBHOOK_SECRET) errors.push("STRIPE_WEBHOOK_SECRET is missing.");
  } else {
    errors.push(`Unknown PAYMENT_PROVIDER "${provider}" — expected "stripe" or "dodo".`);
  }

  // --- General ---
  info.site_url = process.env.NEXT_PUBLIC_SITE_URL || "(not set, defaults to http://localhost:3000)";
  info.moderation = process.env.OPENAI_API_KEY ? "enabled" : "disabled (no OPENAI_API_KEY)";
  info.turnstile = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? "enabled" : "disabled";

  const ok = errors.length === 0;
  return NextResponse.json(
    { status: ok ? "ok" : "unhealthy", errors: ok ? undefined : errors, info },
    { status: ok ? 200 : 503 },
  );
}
