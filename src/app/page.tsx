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
      <nav className="home-nav" aria-label="Main navigation">
        <Link className="brand" href="/">
          CLAIM <b>YOUR</b> TERRITORY
        </Link>
        <span className="home-nav-status"><span className="pulse-dot" /> Live world</span>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">The internet&apos;s live territory exchange</p>
          <h1>Put your flag on the <em>map.</em></h1>
          <p className="lead">
            Claim a country with your brand. Defend it for as long as you can.
            Anyone can take it for 1.5× the current price.
          </p>
          <div className="hero-actions">
            <a className="btn primary hero-cta" href="#boards">Explore territory</a>
            <a className="text-link" href="#how-it-works">How it works <span>↓</span></a>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="territory-globe">
            <span>176</span>
            <small>territories</small>
          </div>
          <div className="signal signal-one" />
          <div className="signal signal-two" />
          <p className="hero-art-label">Every spot is for sale</p>
        </div>
      </section>

      <section className="rules" id="how-it-works">
        <p className="eyebrow">A game of attention</p>
        <div className="rule-grid">
          <article><span>01</span><h2>Choose your ground</h2><p>Find an open country or a rank worth owning.</p></article>
          <article><span>02</span><h2>Plant your flag</h2><p>Buy the spot and put your name, link, and logo on it.</p></article>
          <article><span>03</span><h2>Hold the line</h2><p>Others can conquer it—but only by paying 1.5× more.</p></article>
        </div>
      </section>

      <section className="boards-section" id="boards">
        <div className="section-heading">
          <div><p className="eyebrow">Pick a battlefield</p><h2>Open boards</h2></div>
          <span>{boards.length} live {boards.length === 1 ? "board" : "boards"}</span>
        </div>
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
            <span className="board-number">{b.kind === "map" ? "◎" : "↗"}</span>
            <span><span className="k">{b.kind === "map" ? "Global map" : "Ranked board"}</span><h3>{b.name}</h3></span>
            <span className="board-enter">Enter <span aria-hidden="true">→</span></span>
          </Link>
        ))
      )}
      </section>

      <div className="home-footer">
        <Link href="/terms">Terms of Service</Link>
        <Link href="/privacy">Privacy Policy</Link>
      </div>
    </main>
  );
}
