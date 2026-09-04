"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { browserClient } from "@/lib/supabase/browser";
import { formatMoney } from "@/lib/pricing";
import type { Board, Spot, FeedItem, BoardStats, OwnerTotal } from "@/lib/types";
import AnimatedNumber from "./AnimatedNumber";
import WorldMap from "./WorldMap";
import ListBoard from "./ListBoard";
import SpotModal from "./SpotModal";
import ActivityFeed from "./ActivityFeed";
import WorldPowers from "./WorldPowers";

interface Props {
  board: Board;
  initialSpots: Spot[];
  initialFeed: FeedItem[];
  initialStats: BoardStats;
  initialOwnerTotals: OwnerTotal[];
}

const fmtDollars = (cents: number) => formatMoney(cents, "usd");

export default function BoardView({
  board,
  initialSpots,
  initialFeed,
  initialStats,
  initialOwnerTotals,
}: Props) {
  const [spots, setSpots] = useState<Record<string, Spot>>(() =>
    Object.fromEntries(initialSpots.map((s) => [s.id, s])),
  );
  const [feed, setFeed] = useState<FeedItem[]>(initialFeed);
  const [plundered, setPlundered] = useState<number>(initialStats.total_plundered ?? 0);
  const [online, setOnline] = useState<number>(1);
  const [visitors, setVisitors] = useState<number>(board.visitor_count ?? 0);
  const [clicks, setClicks] = useState<number>(board.click_count ?? 0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ownerTotals, setOwnerTotals] = useState<Record<string, number>>(() =>
    Object.fromEntries((initialOwnerTotals ?? []).map((o) => [o.owner_display, o.lifetime_plunder])),
  );

  const spotList = useMemo(() => Object.values(spots), [spots]);
  const claimed = useMemo(() => spotList.filter((s) => s.owner_display).length, [spotList]);

  const presenceKey = useRef<string>(Math.random().toString(36).slice(2));

  // Register the board visit (unique per session, dedupe is server-side).
  useEffect(() => {
    const key = `warmap:visited:${board.id}`;
    if (typeof window !== "undefined" && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      fetch("/api/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId: board.id }),
      }).catch(() => {});
    }
  }, [board.id]);

  useEffect(() => {
    const supa = browserClient();
    const channel = supa.channel(`board:${board.id}`, {
      config: { presence: { key: presenceKey.current } },
    });

    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "spots", filter: `board_id=eq.${board.id}` },
        (payload) => {
          const row = payload.new as Spot;
          if (row && row.id) setSpots((prev) => ({ ...prev, [row.id]: row }));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_feed",
          filter: `board_id=eq.${board.id}`,
        },
        (payload) => {
          const item = payload.new as FeedItem;
          setFeed((prev) => [item, ...prev].slice(0, 200));
          setPlundered((p) => p + (item.amount || 0));
          // Increment per-owner lifetime plunder (mirrors server-side owner_totals upsert).
          if (item.actor) {
            setOwnerTotals((prev) => ({
              ...prev,
              [item.actor]: (prev[item.actor] ?? 0) + (item.amount || 0),
            }));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "boards", filter: `id=eq.${board.id}` },
        (payload) => {
          const row = payload.new as Board;
          if (row) {
            if (row.visitor_count != null) setVisitors(row.visitor_count);
            if (row.click_count != null) setClicks(row.click_count);
          }
        },
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setOnline(Math.max(1, Object.keys(state).length));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channel.track({ at: Date.now() });
        }
      });

    return () => {
      supa.removeChannel(channel);
    };
  }, [board.id]);

  const selected = selectedId ? spots[selectedId] : null;
  const openSpot = useCallback((id: string) => setSelectedId(id), []);
  const close = useCallback(() => setSelectedId(null), []);

  return (
    <>
      <div className="topbar">
        <Link className="brand" href="/">
          CLAIM <b>YOUR</b> TERRITORY
        </Link>
        <span className="sub board-name">/ {board.name}</span>
        <span className="spacer" />
        <span className="stat online">
          <span className="v">
            <span className="dot" />
            <AnimatedNumber value={online} />
          </span>
          <span className="k">online</span>
        </span>
        <span className="stat">
          <span className="v tnum">
            <AnimatedNumber value={visitors} />
          </span>
          <span className="k">visitors</span>
        </span>
        <span className="stat">
          <span className="v acc tnum">
            <AnimatedNumber value={plundered} format={(n) => formatMoney(n, board.currency)} />
          </span>
          <span className="k">plundered</span>
        </span>
        <span className="stat">
          <span className="v tnum">
            <AnimatedNumber value={clicks} />
          </span>
          <span className="k">clicks</span>
        </span>
        <span className="stat">
          <span className="v tnum">
            {claimed}/{spotList.length}
          </span>
          <span className="k">claimed</span>
        </span>
      </div>

      <div className="stage">
        <aside className="side">
          <div className="mission-card">
            <span className="eyebrow">Your next move</span>
            <p>Choose a territory. Claim it before someone else does.</p>
            <span className="mission-rule">Takeover price: <b>{Number(board.multiplier)}×</b></span>
          </div>
          <div className="panel">
            <h3>War Report</h3>
            <ActivityFeed feed={feed} currency={board.currency} />
          </div>
          <div className="panel">
            <h3>World Powers</h3>
            <WorldPowers
              spots={spotList}
              currency={board.currency}
              ownerTotals={ownerTotals}
            />
          </div>
        </aside>

        <section className="canvas">
          <div className="canvas-heading">
            <span className="eyebrow">Live territory</span>
            <p>{board.kind === "map" ? "Drag to explore · Select a country to make your move" : "Every rank is open to challenge"}</p>
          </div>
          <div className="canvas-coordinates" aria-hidden="true">01° 20′ N &nbsp;·&nbsp; 10° 00′ E</div>
          {board.kind === "map" ? (
            <WorldMap
              board={board}
              spots={spots}
              geographyUrl={
                (board.config?.geographyUrl as string) || "/countries-110m.json"
              }
              onPick={openSpot}
            />
          ) : (
            <ListBoard spotList={spotList} board={board} onPick={openSpot} />
          )}
        </section>
      </div>

      {selected && <SpotModal spot={selected} board={board} onClose={close} />}
    </>
  );
}
