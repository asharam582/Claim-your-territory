import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";
import { activeProvider } from "@/lib/payments";
import { requiredPrice } from "@/lib/pricing";
import type { Board, Spot } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  // Strip ASCII control characters, keep normal text incl. spaces.
  const clean = input.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (clean.length < 1 || clean.length > 40) return null;
  return clean;
}

function sanitizeLink(input: unknown): string | null | undefined {
  if (input == null || input === "") return undefined;
  if (typeof input !== "string") return null;
  // Allow bare domains like "example.com" — prepend https:// if no protocol.
  let raw = input.trim();
  if (raw && !/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function sanitizeEmail(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const e = input.trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : undefined;
}

async function verifyTurnstile(token: unknown): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured -> skip
  if (typeof token !== "string" || !token) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });
  const data = (await res.json()) as { success: boolean };
  return !!data.success;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const spotId = body.spotId;
  const ownerDisplay = sanitizeName(body.ownerDisplay);
  const linkUrl = sanitizeLink(body.linkUrl);
  const email = sanitizeEmail(body.email);
  const logoUrl = typeof body.logoUrl === "string" ? body.logoUrl : null;

  if (typeof spotId !== "string" || !ownerDisplay) {
    return NextResponse.json({ error: "A display name is required." }, { status: 400 });
  }
  if (linkUrl === null) {
    return NextResponse.json({ error: "That link doesn't look valid." }, { status: 400 });
  }
  if (!(await verifyTurnstile(body.turnstileToken))) {
    return NextResponse.json({ error: "Bot check failed. Try again." }, { status: 400 });
  }

  const db = serviceClient();

  const { data: spot, error: spotErr } = await db
    .from("spots")
    .select("*")
    .eq("id", spotId)
    .single<Spot>();
  if (spotErr || !spot) {
    return NextResponse.json({ error: "Spot not found." }, { status: 404 });
  }
  const { data: board } = await db
    .from("boards")
    .select("*")
    .eq("id", spot.board_id)
    .single<Board>();
  if (!board) {
    return NextResponse.json({ error: "Board not found." }, { status: 404 });
  }

  // Enforce moderation: a logo may only be used if it was approved by /upload.
  if (logoUrl) {
    const { data: asset } = await db
      .from("logo_assets")
      .select("id")
      .eq("public_url", logoUrl)
      .eq("mod_status", "ok")
      .maybeSingle();
    if (!asset) {
      return NextResponse.json({ error: "Logo not recognized. Re-upload it." }, { status: 400 });
    }
  }

  const amount = requiredPrice(spot, Number(board.multiplier));

  // Record the attempt with the state we're pricing against.
  const provider = activeProvider();
  const { data: led, error: ledErr } = await db
    .from("ledger")
    .insert({
      board_id: board.id,
      spot_id: spot.id,
      amount,
      expected_version: spot.version,
      expected_price: spot.current_price,
      owner_display: ownerDisplay,
      logo_url: logoUrl,
      link_url: linkUrl ?? null,
      status: "pending",
      provider: provider.id,
    })
    .select("id")
    .single();
  if (ledErr || !led) {
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  let checkout;
  try {
    checkout = await provider.createCheckout({
      ledgerId: led.id,
      amount,
      currency: board.currency,
      productName: `${board.name} — ${spot.label}`,
      description: spot.owner_display
        ? `Conquer ${spot.label} from ${spot.owner_display}`
        : `Claim ${spot.label}`,
      customerEmail: email,
      customerName: ownerDisplay ?? undefined,
      successUrl: `${site}/success?board=${board.slug}`,
      cancelUrl: `${site}/b/${board.slug}?canceled=1`,
    });
  } catch (err) {
    await db.from("ledger").update({ status: "lost" }).eq("id", led.id);
    const msg = err instanceof Error ? err.message : "Could not start checkout.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  await db.from("ledger").update({ provider_ref: checkout.ref }).eq("id", led.id);

  return NextResponse.json({ url: checkout.url });
}
