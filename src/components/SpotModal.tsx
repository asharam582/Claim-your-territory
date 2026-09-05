"use client";

import { useEffect, useRef, useState } from "react";
import { requiredPrice, actionKind, formatMoney } from "@/lib/pricing";
import { tierForKey } from "@/lib/tiers";
import TierBadge from "./TierBadge";
import RulerCard from "./RulerCard";
import type { Board, Spot } from "@/lib/types";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
    };
  }
}

const COLOR_PALETTE = [
  "#dff550", // lime (default owned)
  "#ff7769", // red
  "#50b4ff", // blue
  "#f59e0b", // amber
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#ff6b35", // orange
];

function roundToWholeDollar(cents: number): number {
  return Math.ceil(cents / 100) * 100;
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
  const [warCry, setWarCry] = useState("");
  const [color, setColor] = useState<string>(COLOR_PALETTE[0]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string>("");
  const tsRef = useRef<HTMLDivElement>(null);

  const kind = actionKind(spot);
  const minPrice = requiredPrice(spot, Number(board.multiplier));

  // Quick-bid amounts: min, 2×, 5× — all rounded to whole dollar.
  const bidOptions = [
    { label: "MIN", amount: minPrice },
    { label: "2×", amount: roundToWholeDollar(minPrice * 2) },
    { label: "5×", amount: roundToWholeDollar(minPrice * 5) },
  ];
  const [bidAmount, setBidAmount] = useState<number>(minPrice);
  const [customBid, setCustomBid] = useState<string>("");
  const [useCustomBid, setUseCustomBid] = useState(false);

  const effectiveBid = useCustomBid
    ? Math.round(parseFloat(customBid || "0") * 100)
    : bidAmount;
  const bidTooLow = effectiveBid < minPrice;

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
    if (bidTooLow) {
      setError(`Minimum bid is ${formatMoney(minPrice, board.currency)}.`);
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
          warCry: warCry || undefined,
          color: color || undefined,
          bidAmount: effectiveBid !== minPrice ? effectiveBid : undefined,
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

  const nextTakerPrice = roundToWholeDollar(effectiveBid * Number(board.multiplier));

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          {kind === "conquer" ? "⚔ Conquer" : "🏴 Claim"} {spot.label}
          {board.kind === "map" && (
            <TierBadge tier={tierForKey(spot.key)} />
          )}
        </h2>

        {spot.owner_display && (
          <RulerCard spot={spot} currency={board.currency} />
        )}

        {!spot.owner_display && (
          <p className="muted">Unclaimed. Plant your flag.</p>
        )}

        <div className="price-line">
          <span className="big tnum">{formatMoney(effectiveBid, board.currency)}</span>
          <span className="note">
            next taker pays {formatMoney(nextTakerPrice, board.currency)}
          </span>
        </div>

        {/* Quick-bid buttons */}
        <div className="bid-row">
          {bidOptions.map((opt) => (
            <button
              key={opt.label}
              type="button"
              className={`bid-btn${!useCustomBid && bidAmount === opt.amount ? " active" : ""}`}
              onClick={() => {
                setBidAmount(opt.amount);
                setUseCustomBid(false);
              }}
            >
              {opt.label}
              <small>{formatMoney(opt.amount, board.currency)}</small>
            </button>
          ))}
          <div className="bid-custom">
            <span className="bid-dollar">$</span>
            <input
              type="number"
              min={minPrice / 100}
              step="1"
              placeholder="Custom"
              value={customBid}
              onChange={(e) => {
                setCustomBid(e.target.value);
                setUseCustomBid(true);
              }}
              onFocus={() => setUseCustomBid(true)}
              className={useCustomBid ? "active" : ""}
            />
          </div>
        </div>
        {bidTooLow && (
          <div className="err" style={{ marginTop: 4 }}>
            Below minimum ({formatMoney(minPrice, board.currency)})
          </div>
        )}

        <div className="field">
          <label>Empire name</label>
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
            type="email"
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
          <label>War cry (optional)</label>
          <input
            type="text"
            maxLength={80}
            value={warCry}
            onChange={(e) => setWarCry(e.target.value)}
            placeholder="We came, we saw, we conquered"
          />
        </div>

        <div className="field">
          <label>Territory color</label>
          <div className="color-row">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-swatch${color === c ? " active" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={c}
              />
            ))}
          </div>
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
          <button className="btn" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={submit}
            disabled={submitting || uploading || bidTooLow}
            style={{ flex: 1 }}
          >
            {submitting
              ? "Redirecting…"
              : uploading
                ? "Uploading…"
                : `${kind === "conquer" ? "INVADE" : "CLAIM"} FOR ${formatMoney(effectiveBid, board.currency)}`}
          </button>
        </div>

        <p className="warn-note">
          Payment is non-refundable. Your spot can be taken by anyone paying 1.5×
          at any time — you get nothing back when it is. This is entertainment, not
          an investment. By paying you agree to
          our <a href="/terms" target="_blank" rel="noopener">Terms</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy&nbsp;Policy</a>.
        </p>
      </div>
    </div>
  );
}
