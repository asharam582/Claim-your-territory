"use client";

import { useMemo } from "react";
import { formatMoney } from "@/lib/pricing";
import type { Spot } from "@/lib/types";

export default function WorldPowers({
  spots,
  currency,
}: {
  spots: Spot[];
  currency: string;
}) {
  const powers = useMemo(() => {
    const map = new Map<string, { name: string; territories: number; spend: number }>();
    for (const s of spots) {
      if (!s.owner_display) continue;
      const cur = map.get(s.owner_display) ?? { name: s.owner_display, territories: 0, spend: 0 };
      cur.territories += 1;
      cur.spend += s.current_price;
      map.set(s.owner_display, cur);
    }
    return [...map.values()].sort((a, b) => b.spend - a.spend).slice(0, 10);
  }, [spots]);

  if (powers.length === 0) {
    return <div style={{ padding: "10px 14px", color: "var(--ink-faint)", fontSize: 13 }}>The map is unclaimed.</div>;
  }
  return (
    <div>
      {powers.map((p, i) => (
        <div className="power" key={p.name}>
          <span className="rank tnum">{i + 1}</span>
          <span>
            <div className="name">{p.name}</div>
            <div className="terr">
              {p.territories} {p.territories === 1 ? "territory" : "territories"}
            </div>
          </span>
          <span className="spend tnum">{formatMoney(p.spend, currency)}</span>
        </div>
      ))}
    </div>
  );
}
