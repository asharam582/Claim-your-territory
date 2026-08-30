"use client";

import { formatMoney } from "@/lib/pricing";
import type { FeedItem } from "@/lib/types";

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function ActivityFeed({
  feed,
  currency,
}: {
  feed: FeedItem[];
  currency: string;
}) {
  if (feed.length === 0) {
    return <div style={{ padding: "10px 14px", color: "var(--ink-faint)", fontSize: 13 }}>No moves yet. Be first.</div>;
  }
  return (
    <div>
      {feed.map((f) => (
        <div className="feed-item" key={f.id}>
          <span className="flag">{f.type === "conquer" ? "⚔" : "•"}</span>
          <span>
            <span className="who">{f.actor}</span>{" "}
            <span className="act">
              {f.type === "conquer" ? `took ${f.label}` : `claimed ${f.label}`}
              {f.from_owner ? ` from ${f.from_owner}` : ""}
            </span>
          </span>
          <span className="amt tnum" title={ago(f.created_at) + " ago"}>
            {formatMoney(f.amount, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}
