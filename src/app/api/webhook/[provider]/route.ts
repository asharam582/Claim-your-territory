import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";
import { providerById } from "@/lib/payments";
import { fulfill } from "@/lib/payments/fulfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One endpoint per provider:
//   Stripe -> /api/webhook/stripe
//   Dodo   -> /api/webhook/dodo
export async function POST(req: NextRequest, { params }: { params: { provider: string } }) {
  const provider = providerById(params.provider);
  if (!provider) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 404 });
  }

  const raw = await req.text();

  // 1) Verify signature + normalize the event.
  let result;
  try {
    result = await provider.parseWebhook(raw, req.headers);
  } catch (err) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }
  if (result.kind === "ignored") {
    return NextResponse.json({ received: true, ignored: true });
  }

  const db = serviceClient();

  // 2) Idempotency: record the event id; a duplicate delivery short-circuits.
  const eventKey = `${provider.id}:${result.eventId}`;
  const { error: dupErr } = await db.from("webhook_events").insert({ event_id: eventKey });
  if (dupErr) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // 3) Resolve the race + settle payment.
  try {
    await fulfill(db, provider, result);
  } catch (err) {
    // Allow the provider to retry: drop the idempotency marker.
    await db.from("webhook_events").delete().eq("event_id", eventKey);
    console.error(`[webhook:${provider.id}] processing error`, err);
    return NextResponse.json({ error: "Processing error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
