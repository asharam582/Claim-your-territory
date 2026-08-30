// ---------------------------------------------------------------------------
// Seed script: creates a world-map board (176 countries) and a demo
// leaderboard board (50 slots). Idempotent — re-running never wipes live data
// (spots are inserted only when missing).
//
//   npm run seed          # uses --env-file=.env.local (see package.json)
//
// Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  console.error("Run with: node --env-file=.env.local scripts/seed.mjs");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function upsertBoard(board) {
  const { data, error } = await db
    .from("boards")
    .upsert(board, { onConflict: "slug" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function insertSpotsIfMissing(rows) {
  // ignoreDuplicates => only brand-new spots are inserted; existing (possibly
  // owned) spots are left untouched.
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await db
      .from("spots")
      .upsert(rows.slice(i, i + chunk), {
        onConflict: "board_id,key",
        ignoreDuplicates: true,
      });
    if (error) throw error;
  }
}

async function main() {
  // ---- World map board ----------------------------------------------------
  const mapBoard = await upsertBoard({
    slug: "world",
    name: "The World Is For Sale",
    kind: "map",
    multiplier: 1.5,
    currency: "usd",
    config: { geographyUrl: "/countries-110m.json" },
  });
  console.log("Board:", mapBoard.slug, mapBoard.id);

  const countries = JSON.parse(
    readFileSync(join(__dirname, "..", "data", "countries.json"), "utf8"),
  );
  const mapSpots = countries.map((c) => ({
    board_id: mapBoard.id,
    key: c.key,
    label: c.name,
    base_price: c.basePrice,
    current_price: c.basePrice,
    position: null,
  }));
  await insertSpotsIfMissing(mapSpots);
  console.log(`Seeded ${mapSpots.length} country spots.`);

  // ---- Demo leaderboard board ---------------------------------------------
  const SLOTS = 50;
  const boardPrice = 300; // $3 base per rank
  const lbBoard = await upsertBoard({
    slug: "top",
    name: "Top 50 — Claim Your Rank",
    kind: "leaderboard",
    multiplier: 1.5,
    currency: "usd",
    config: { slots: SLOTS },
  });
  console.log("Board:", lbBoard.slug, lbBoard.id);

  const lbSpots = Array.from({ length: SLOTS }, (_, i) => ({
    board_id: lbBoard.id,
    key: String(i + 1),
    label: `Rank #${i + 1}`,
    base_price: boardPrice,
    current_price: boardPrice,
    position: i + 1,
  }));
  await insertSpotsIfMissing(lbSpots);
  console.log(`Seeded ${lbSpots.length} leaderboard slots.`);

  console.log("\nDone. Visit /b/world (map) and /b/top (leaderboard).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
