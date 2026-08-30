import Link from "next/link";
import { serviceClient } from "@/lib/supabase/server";
import type { Board } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let boards: Board[] = [];
  try {
    const db = serviceClient();
    const { data } = await db.from("boards").select("*").order("created_at");
    boards = (data as Board[]) ?? [];
  } catch {
    // env not configured yet
  }

  return (
    <main className="home">
      <h1>The world is for sale.</h1>
      <p className="lead">
        Claim a spot with your logo. Hold it as long as you can. Anyone can take it
        from you for 1.5× your bid — and you get nothing back. That&apos;s the game.
      </p>

      {boards.length === 0 ? (
        <div className="boardcard">
          <h3>No boards yet</h3>
          <p className="k" style={{ marginTop: 8 }}>
            Configure your Supabase env and run <code className="mono">npm run seed</code> to
            create the world map and leaderboard boards.
          </p>
        </div>
      ) : (
        boards.map((b) => (
          <Link className="boardcard" key={b.id} href={`/b/${b.slug}`}>
            <span className="k">{b.kind}</span>
            <h3>{b.name}</h3>
          </Link>
        ))
      )}

      <div className="home-footer">
        <Link href="/terms">Terms of Service</Link>
        <Link href="/privacy">Privacy Policy</Link>
      </div>
    </main>
  );
}
