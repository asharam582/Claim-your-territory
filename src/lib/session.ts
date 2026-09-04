/**
 * Anonymous session cookie — HMAC-signed, httpOnly, no login needed.
 *
 * Cookie format: `<uuid>.<base64url(hmac)>`
 * The session id is a random UUID generated per-browser. The HMAC prevents
 * tampering without access to SESSION_SECRET. Losing/clearing the cookie
 * only affects "Mine" filtering and unique-visitor counting — never
 * ownership, payments, or spot state.
 */

const COOKIE_NAME = "sid";
const ENCODER = new TextEncoder();

function getSecret(): string {
  // Falls back to a stable default in dev so the cookie survives server
  // restarts during `npm run dev`. In production, always set SESSION_SECRET.
  return process.env.SESSION_SECRET || "warmap-dev-session-secret-do-not-use-in-prod";
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    ENCODER.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (base64.length % 4)) % 4;
  const binary = atob(base64 + "=".repeat(pad));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Sign a session id → `<id>.<hmac>` */
export async function signSessionId(id: string): Promise<string> {
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, ENCODER.encode(id));
  return `${id}.${toBase64Url(sig)}`;
}

/** Verify a signed cookie value → the session id, or null if invalid. */
export async function verifySessionCookie(raw: string | undefined | null): Promise<string | null> {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const id = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  try {
    const key = await hmacKey();
    const valid = await crypto.subtle.verify("HMAC", key, fromBase64Url(sig) as BufferSource, ENCODER.encode(id));
    return valid ? id : null;
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
