import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";
import { verifySessionCookie, COOKIE_NAME } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/click — record an outbound "VISIT" link click for the header
 * CLICKS stat and the per-spot click count shown in the ruler card.
 *
 * Calls record_click(spot_id, session_id) which increments both
 * spots.click_count and boards.click_count.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const spotId = body?.spotId;
  if (typeof spotId !== "string") {
    return NextResponse.json({ error: "spotId required." }, { status: 400 });
  }

  const rawSid = req.cookies.get(COOKIE_NAME)?.value;
  const sessionId = await verifySessionCookie(rawSid);

  const db = serviceClient();
  const { data, error } = await db.rpc("record_click", {
    p_spot_id: spotId,
    p_session_id: sessionId ?? "anon",
  });

  if (error) {
    console.error("record_click error:", error.message);
    return NextResponse.json({ clickCount: null });
  }

  return NextResponse.json({ clickCount: data });
}
