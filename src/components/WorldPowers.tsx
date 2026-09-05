"use client";

import { useCallback, useMemo, useState } from "react";
import { List } from "react-window";
import { motion } from "framer-motion";
import { formatMoney } from "@/lib/pricing";
import type { Spot } from "@/lib/types";

type SortMode = "value" | "territories" | "plunder";
const ROW_HEIGHT = 48;
const VIRTUALIZE_THRESHOLD = 30;

interface PowerEntry {
  name: string;
  territories: number;
  spend: number;
  plunder: number;
}

interface PowerRowProps {
  powers: PowerEntry[];
  currency: string;
  sortMode: SortMode;
}

function PowerRow({
  index,
  style,
  powers,
  currency,
  sortMode,
}: {
  index: number;
  style?: React.CSSProperties;
  ariaAttributes?: Record<string, unknown>;
} & PowerRowProps) {
  const p = powers[index];
  if (!p) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.3) }}
      style={style}
    >
      <div className="power" style={style ? { height: ROW_HEIGHT } : undefined}>
        <span className="rank tnum">{index + 1}</span>
        <span>
          <div className="name">{p.name}</div>
          <div className="terr">
            {p.territories} {p.territories === 1 ? "territory" : "territories"}
            {sortMode === "plunder" && p.plunder
              ? ` · ${formatMoney(p.plunder, currency)} plundered`
              : ""}
          </div>
        </span>
        <span className="spend tnum">{formatMoney(p.spend, currency)}</span>
      </div>
    </motion.div>
  );
}

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
    const map = new Map<string, PowerEntry>();
    for (const s of spots) {
      if (!s.owner_display) continue;
      const cur = map.get(s.owner_display) ?? {
        name: s.owner_display,
        territories: 0,
        spend: 0,
        plunder: 0,
      };
      cur.territories += 1;
      cur.spend += s.current_price;
      cur.plunder = ownerTotals[s.owner_display] ?? 0;
      map.set(s.owner_display, cur);
    }
    const list = [...map.values()];
    switch (sortMode) {
      case "territories":
        list.sort((a, b) => b.territories - a.territories || b.spend - a.spend);
        break;
      case "plunder":
        list.sort((a, b) => b.plunder - a.plunder || b.spend - a.spend);
        break;
      default:
        list.sort((a, b) => b.spend - a.spend);
    }
    return list.slice(0, 20);
  }, [spots, sortMode, ownerTotals]);

  const useVirtualization = powers.length > VIRTUALIZE_THRESHOLD;

  const VirtualRow = useCallback(
    ({ index, style, powers: p, currency: c, sortMode: s }: {
      index: number;
      style: React.CSSProperties;
      ariaAttributes: { "aria-posinset": number; "aria-setsize": number; role: "listitem" };
    } & PowerRowProps) => (
      <PowerRow index={index} style={style} powers={p} currency={c} sortMode={s} />
    ),
    [],
  );

  const vpRowProps: PowerRowProps = useMemo(
    () => ({ powers, currency, sortMode }),
    [powers, currency, sortMode],
  );

  if (powers.length === 0) {
    return (
      <div style={{ padding: "10px 14px", color: "var(--ink-faint)", fontSize: 13 }}>
        The map is unclaimed.
      </div>
    );
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

      {useVirtualization ? (
        <List<PowerRowProps>
          rowComponent={VirtualRow}
          rowProps={vpRowProps}
          rowCount={powers.length}
          rowHeight={ROW_HEIGHT}
          defaultHeight={Math.min(powers.length * ROW_HEIGHT, 400)}
          overscanCount={5}
          style={{ maxHeight: 400, overflow: "auto" }}
        />
      ) : (
        powers.map((_, i) => (
          <PowerRow
            key={powers[i].name}
            index={i}
            powers={powers}
            currency={currency}
            sortMode={sortMode}
          />
        ))
      )}
    </div>
  );
}
