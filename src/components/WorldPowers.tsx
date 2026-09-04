"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/pricing";
import type { Spot } from "@/lib/types";

type SortMode = "value" | "territories" | "plunder";

export default function WorldPowers({
  spots,
  currency,
  ownerTotals,
}: {
  spots: Spot[];
  currency: string;
  ownerTotals: Record<string, number>;
}) {
  const [sortMode, setSortMode] = useState<SortMode>("value");

  const powers = useMemo(() => {
    const map = new Map<string, { name: string; territories: number; spend: number }>();
    for (const s of spots) {
      if (!s.owner_display) continue;
      const cur = map.get(s.owner_display) ?? { name: s.owner_display, territories: 0, spend: 0 };
      cur.territories += 1;
      cur.spend += s.current_price;
      map.set(s.owner_display, cur);
    }
    const list = [...map.values()];
    switch (sortMode) {
      case "territories":
        list.sort((a, b) => b.territories - a.territories || b.spend - a.spend);
        break;
      case "plunder":
        list.sort(
          (a, b) =>
            (ownerTotals[b.name] ?? 0) - (ownerTotals[a.name] ?? 0) || b.spend - a.spend,
        );
        break;
      default:
        list.sort((a, b) => b.spend - a.spend);
    }
    return list.slice(0, 20);
  }, [spots, sortMode, ownerTotals]);

  if (powers.length === 0) {
    return <div style={{ padding: "10px 14px", color: "var(--ink-faint)", fontSize: 13 }}>The map is unclaimed.</div>;
  }

  return (
    <div>
      <div className="sort-bar">
        {(["value", "territories", "plunder"] as SortMode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={`sort-btn${sortMode === m ? " active" : ""}`}
            onClick={() => setSortMode(m)}
          >
            {m === "value" ? "Value" : m === "territories" ? "Territories" : "Plunder"}
          </button>
        ))}
      </div>
      {powers.map((p, i) => (
        <div className="power" key={p.name}>
          <span className="rank tnum">{i + 1}</span>
          <span>
            <div className="name">{p.name}</div>
            <div className="terr">
              {p.territories} {p.territories === 1 ? "territory" : "territories"}
              {sortMode === "plunder" && ownerTotals[p.name]
                ? ` · ${formatMoney(ownerTotals[p.name], currency)} plundered`
                : ""}
            </div>
          </span>
          <span className="spend tnum">{formatMoney(p.spend, currency)}</span>
        </div>
      ))}
    </div>
  );
}
