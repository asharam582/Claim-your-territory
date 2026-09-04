import { NextRequest, NextResponse } from "next/server";
import { signSessionId, verifySessionCookie, COOKIE_NAME } from "@/lib/session";

/**
 * Middleware: ensure every request carries a valid anonymous session cookie.
 *
 * - If `sid` is present and verifies, do nothing.
 * - Otherwise, generate a new UUID, sign it, and set the cookie.
 *
 * The cookie is httpOnly (invisible to document.cookie), signed with HMAC,
 * SameSite=Lax, Secure in production, and lasts ~1 year. It carries no
 * privilege — it's used only for "Mine" feed filtering and unique-visitor
 * counting. Losing it has zero impact on ownership or payment records.
 */
export async function middleware(req: NextRequest) {
  const existing = req.cookies.get(COOKIE_NAME)?.value;
  const verified = await verifySessionCookie(existing);

  if (verified) {
    // Cookie is valid — pass through.
    return NextResponse.next();
  }

  // Issue a fresh session cookie.
  const id = crypto.randomUUID();
  const signed = await signSessionId(id);

  const res = NextResponse.next();
  res.cookies.set(COOKIE_NAME, signed, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365, // ~1 year
    path: "/",
  });

  return res;
}

export const config = {
  matcher: [
    // Match everything except Next.js internals and static files.
    "/((?!_next/static|_next/image|favicon\\.ico|countries-110m\\.json|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot)).*)",
  ],
};
