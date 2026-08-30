"use client";

import { useEffect, useRef, useState } from "react";
import { requiredPrice, actionKind, formatMoney } from "@/lib/pricing";
import type { Board, Spot } from "@/lib/types";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
    };
  }
}

export default function SpotModal({
  spot,
  board,
  onClose,
}: {
  spot: Spot;
  board: Board;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string>("");
  const tsRef = useRef<HTMLDivElement>(null);

  const kind = actionKind(spot);
  const price = requiredPrice(spot, Number(board.multiplier));
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !tsRef.current) return;
    const el = tsRef.current;
    const render = () => {
      if (window.turnstile && el.childElementCount === 0) {
        window.turnstile.render(el, {
          sitekey: siteKey,
          callback: (t: string) => (tokenRef.current = t),
        });
      }
    };
    if (window.turnstile) {
      render();
    } else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    }
  }, [siteKey]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setLogoUrl(data.logoUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError("Enter a display name.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spotId: spot.id,
          ownerDisplay: name,
          email: email || undefined,
          linkUrl: link || undefined,
          logoUrl: logoUrl || undefined,
          turnstileToken: tokenRef.current || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start checkout.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          {kind === "conquer" ? "Conquer" : "Claim"} {spot.label}
        </h2>
        <p className="muted">
          {spot.owner_display
            ? `Currently held by ${spot.owner_display}. Take it — they get nothing back.`
            : "Unclaimed. Plant your flag."}
        </p>

        <div className="price-line">
          <span className="big tnum">{formatMoney(price, board.currency)}</span>
          <span className="note">
            next taker pays{" "}
            {formatMoney(Math.ceil((price * Number(board.multiplier)) / 100) * 100, board.currency)}
          </span>
        </div>

        <div className="field">
          <label>Display name</label>
          <input
            type="text"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="your brand"
          />
        </div>

        <div className="field">
          <label>Email (for your receipt)</label>
          <input
            type="text"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="field">
          <label>Link (optional)</label>
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://yoursite.com"
          />
        </div>

        <div className="field">
          <label>Logo (optional)</label>
          <div className="uploader">
            {logoUrl ? (
              <span className="prev-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="prev" src={logoUrl} alt="logo preview" />
                <button
                  type="button"
                  className="discard-btn"
                  aria-label="Remove logo"
                  onClick={() => setLogoUrl(null)}
                >
                  ✕
                </button>
              </span>
            ) : (
              <span className="prev" />
            )}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={onFile} />
          </div>
        </div>

        {siteKey && <div ref={tsRef} style={{ marginBottom: 12 }} />}
        {error && <div className="err">{error}</div>}

        <div className="rowbtns">
          <button className="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={submit}
            disabled={submitting || uploading}
            style={{ flex: 1 }}
          >
            {submitting
              ? "Redirecting…"
              : uploading
                ? "Uploading…"
                : `Pay ${formatMoney(price, board.currency)} to ${kind}`}
          </button>
        </div>

        <p className="warn-note">
          Payment is non-refundable. Your spot can be taken by anyone paying 1.5×
          at any time — you get nothing back when it is. This is entertainment, not
          an investment.
        </p>
      </div>
    </div>
  );
}
