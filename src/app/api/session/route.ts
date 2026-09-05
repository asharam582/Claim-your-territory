import { NextRequest, NextResponse } from "next/server";
import { verifySessionCookie, COOKIE_NAME } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/session — returns the caller's anonymous session id.
 *
 * This is the one sanctioned way for client JS to learn its own opaque
 * session id (needed for the "Mine" feed filter). The httpOnly cookie
 * is invisible to document.cookie; this route reads it server-side and
 * hands back just the id.
 */
export async function GET(req: NextRequest) {
  const raw = req.cookies.get(COOKIE_NAME)?.value;
  const sessionId = await verifySessionCookie(raw);

  if (!sessionId) {
    return NextResponse.json({ sessionId: null }, { status: 200 });
  }

  return NextResponse.json({ sessionId });
}
