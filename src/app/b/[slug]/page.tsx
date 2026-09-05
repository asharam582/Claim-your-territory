import { notFound } from "next/navigation";
import { serviceClient } from "@/lib/supabase/server";
import BoardView from "@/components/BoardView";
import type { Board, Spot, FeedItem, BoardStats, OwnerTotal } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = serviceClient();

  const { data: board } = await db
    .from("boards")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Board>();
  if (!board) notFound();

  const [{ data: spots }, { data: feed }, { data: stats }, { data: ownerTotals }] =
    await Promise.all([
      db.from("spots").select("*").eq("board_id", board.id).order("position", { nullsFirst: false }),
      db
        .from("activity_feed")
        .select("*")
        .eq("board_id", board.id)
        .order("created_at", { ascending: false })
        .limit(100),
      db.rpc("board_stats", { p_board_id: board.id }),
      db
        .from("owner_totals")
        .select("owner_display, lifetime_plunder")
        .eq("board_id", board.id),
    ]);

  const statsRow: BoardStats = Array.isArray(stats)
    ? (stats[0] as BoardStats)
    : (stats as unknown as BoardStats) ?? {
        claimed_count: 0,
        total_spots: 0,
        total_plundered: 0,
      };

  return (
    <BoardView
      board={board}
      initialSpots={(spots as Spot[]) ?? []}
      initialFeed={(feed as FeedItem[]) ?? []}
      initialStats={statsRow}
      initialOwnerTotals={(ownerTotals as OwnerTotal[]) ?? []}
    />
  );
}
