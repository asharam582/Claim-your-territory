"use client";

import { formatMoney } from "@/lib/pricing";
import AnimatedNumber from "./AnimatedNumber";
import type { Spot } from "@/lib/types";

/**
 * Current ruler card — shown inside SpotModal when a country is owned.
 * Displays owner info, amount paid, click count, and a VISIT button
 * that opens the owner's link AND records the click server-side.
 */
export default function RulerCard({
  spot,
  currency,
}: {
  spot: Spot;
  currency: string;
}) {
  if (!spot.owner_display) return null;

  function visit() {
    if (!spot.link_url) return;
    window.open(spot.link_url, "_blank", "noopener,noreferrer");
    // Fire-and-forget click tracking — keepalive survives the window.open
    fetch("/api/click", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spotId: spot.id }),
    }).catch(() => {});
  }

  return (
    <div className="ruler-card">
      <div className="ruler-header">
        {spot.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ruler-logo" src={spot.logo_url} alt="" />
        )}
        <div className="ruler-info">
          <div className="ruler-name">{spot.owner_display}</div>
          {spot.war_cry && <div className="ruler-cry">&ldquo;{spot.war_cry}&rdquo;</div>}
        </div>
      </div>
      <div className="ruler-stats">
        <span className="ruler-stat">
          <span className="ruler-stat-v tnum">{formatMoney(spot.current_price, currency)}</span>
          <span className="ruler-stat-k">paid</span>
        </span>
        <span className="ruler-stat">
          <span className="ruler-stat-v tnum">
            <AnimatedNumber value={spot.click_count ?? 0} />
          </span>
          <span className="ruler-stat-k">clicks</span>
        </span>
        {spot.link_url && (
          <button type="button" className="btn ruler-visit" onClick={visit}>
            VISIT ↗
          </button>
        )}
      </div>
    </div>
  );
}
