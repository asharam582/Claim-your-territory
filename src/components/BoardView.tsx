"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase/browser";
import { formatMoney } from "@/lib/pricing";
import type { Board, Spot, FeedItem, BoardStats } from "@/lib/types";
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
}

export default function BoardView({ board, initialSpots, initialFeed, initialStats }: Props) {
  const [spots, setSpots] = useState<Record<string, Spot>>(() =>
    Object.fromEntries(initialSpots.map((s) => [s.id, s])),
  );
  const [feed, setFeed] = useState<FeedItem[]>(initialFeed);
  const [plundered, setPlundered] = useState<number>(initialStats.total_plundered ?? 0);
  const [online, setOnline] = useState<number>(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const spotList = useMemo(() => Object.values(spots), [spots]);
  const claimed = useMemo(() => spotList.filter((s) => s.owner_display).length, [spotList]);

  const presenceKey = useRef<string>(Math.random().toString(36).slice(2));

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
          setFeed((prev) => [item, ...prev].slice(0, 60));
          setPlundered((p) => p + (item.amount || 0));
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
        <span className="brand">
          THE WORLD IS <b>FOR SALE</b>
        </span>
        <span className="sub">{board.name}</span>
        <span className="spacer" />
        <span className="stat online">
          <span className="v">
            <span className="dot" />
            {online}
          </span>
          <span className="k">online</span>
        </span>
        <span className="stat">
          <span className="v acc tnum">{formatMoney(plundered, board.currency)}</span>
          <span className="k">plundered</span>
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
          <div className="panel">
            <h3>War Report</h3>
            <ActivityFeed feed={feed} currency={board.currency} />
          </div>
          <div className="panel">
            <h3>World Powers</h3>
            <WorldPowers spots={spotList} currency={board.currency} />
          </div>
        </aside>

        <section className="canvas">
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
