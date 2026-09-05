"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { List } from "react-window";
import { motion, AnimatePresence } from "framer-motion";
import { formatMoney } from "@/lib/pricing";
import type { FeedItem } from "@/lib/types";

type FilterMode = "all" | "claims" | "invasions" | "mine";
const ROW_HEIGHT = 42;
const VIRTUALIZE_THRESHOLD = 30;

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

interface FeedRowProps {
  items: FeedItem[];
  currency: string;
  seenIds: Set<string>;
}

/** Single feed row — used both plain and as a react-window rowComponent. */
function FeedRow({
  index,
  style,
  items,
  currency,
  seenIds,
}: {
  index: number;
  style?: React.CSSProperties;
  items: FeedItem[];
  currency: string;
  seenIds: Set<string>;
  ariaAttributes?: Record<string, unknown>;
}) {
  const f = items[index];
  if (!f) return null;
  const isNew = !seenIds.has(f.id);

  const content = (
    <>
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
    </>
  );

  // Animate only truly new items (not present in the initial set).
  if (isNew) {
    return (
      <motion.div
        key={f.id}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        className="feed-item"
        style={style}
      >
        {content}
      </motion.div>
    );
  }

  return (
    <div className="feed-item" style={style}>
      {content}
    </div>
  );
}

export default function ActivityFeed({
  feed,
  currency,
}: {
  feed: FeedItem[];
  currency: string;
}) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Track which ids were present on mount — only animate ids that arrive later.
  const seenIds = useRef<Set<string>>(new Set(feed.map((f) => f.id)));
  useEffect(() => {
    // Mark new items as seen after their animation completes.
    const timeout = setTimeout(() => {
      for (const f of feed) seenIds.current.add(f.id);
    }, 400);
    return () => clearTimeout(timeout);
  }, [feed]);

  // Fetch session id for "Mine" filter (one-shot).
  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((data) => {
        if (data.sessionId) setSessionId(data.sessionId);
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    switch (filter) {
      case "claims":
        return feed.filter((f) => f.type === "claim");
      case "invasions":
        return feed.filter((f) => f.type === "conquer");
      case "mine":
        return sessionId ? feed.filter((f) => f.session_id === sessionId) : [];
      default:
        return feed;
    }
  }, [feed, filter, sessionId]);

  const useVirtualization = filtered.length > VIRTUALIZE_THRESHOLD;

  // react-window v2: rowComponent receives { index, style, ariaAttributes } ∪ RowProps.
  const VirtualRow = useCallback(
    ({ index, style, items: it, currency: cur, seenIds: seen }: {
      index: number;
      style: React.CSSProperties;
      ariaAttributes: { "aria-posinset": number; "aria-setsize": number; role: "listitem" };
    } & FeedRowProps) => (
      <FeedRow index={index} style={style} items={it} currency={cur} seenIds={seen} />
    ),
    [],
  );

  const rowProps: FeedRowProps = useMemo(
    () => ({ items: filtered, currency, seenIds: seenIds.current }),
    [filtered, currency],
  );

  return (
    <div>
      <div className="filter-bar">
        {(["all", "claims", "invasions", "mine"] as FilterMode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={`filter-btn${filter === m ? " active" : ""}`}
            onClick={() => setFilter(m)}
          >
            {m === "all" ? "All" : m === "claims" ? "Claims" : m === "invasions" ? "Invasions" : "Mine"}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: "10px 14px", color: "var(--ink-faint)", fontSize: 13 }}>
          {filter === "mine" && !sessionId
            ? "Loading your session…"
            : "No moves yet. Be first."}
        </div>
      ) : useVirtualization ? (
        <List<FeedRowProps>
          rowComponent={VirtualRow}
          rowProps={rowProps}
          rowCount={filtered.length}
          rowHeight={ROW_HEIGHT}
          defaultHeight={Math.min(filtered.length * ROW_HEIGHT, 400)}
          overscanCount={5}
          style={{ maxHeight: 400, overflow: "auto" }}
        />
      ) : (
        <AnimatePresence initial={false}>
          {filtered.map((f, i) => (
            <FeedRow
              key={f.id}
              index={i}
              items={filtered}
              currency={currency}
              seenIds={seenIds.current}
            />
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}
