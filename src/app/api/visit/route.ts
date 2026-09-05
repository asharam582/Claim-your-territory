import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";
import { verifySessionCookie, COOKIE_NAME } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/visit — record a unique board visit for the header VISITORS stat.
 *
 * Calls record_visit(board_id, session_id) which inserts into board_visits
 * with ON CONFLICT DO NOTHING (dedup per session) and increments
 * boards.visitor_count only on new sessions.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const boardId = body?.boardId;
  if (typeof boardId !== "string") {
    return NextResponse.json({ error: "boardId required." }, { status: 400 });
  }

  const rawSid = req.cookies.get(COOKIE_NAME)?.value;
  const sessionId = await verifySessionCookie(rawSid);
  if (!sessionId) {
    // No valid session — can't dedupe. Silently succeed (don't block UX).
    return NextResponse.json({ visitorCount: null });
  }

  const db = serviceClient();
  const { data, error } = await db.rpc("record_visit", {
    p_board_id: boardId,
    p_session_id: sessionId,
  });

  if (error) {
    console.error("record_visit error:", error.message);
    return NextResponse.json({ visitorCount: null });
  }

  return NextResponse.json({ visitorCount: data });
}
