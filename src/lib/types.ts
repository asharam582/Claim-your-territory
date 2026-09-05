export type BoardKind = "map" | "leaderboard";

export interface Board {
  id: string;
  slug: string;
  name: string;
  kind: BoardKind;
  multiplier: number;
  currency: string;
  config: Record<string, unknown>;
  visitor_count: number;
  click_count: number;
}

export interface Spot {
  id: string;
  board_id: string;
  key: string;
  label: string;
  base_price: number;
  current_price: number;
  owner_display: string | null;
  logo_url: string | null;
  link_url: string | null;
  color: string | null;
  war_cry: string | null;
  click_count: number;
  version: number;
  position: number | null;
  times_taken: number;
  conquered_at: string | null;
}

export interface FeedItem {
  id: string;
  board_id: string;
  spot_id: string;
  type: "claim" | "conquer";
  actor: string;
  from_owner: string | null;
  label: string;
  amount: number;
  session_id: string | null;
  created_at: string;
}

export interface BoardStats {
  claimed_count: number;
  total_spots: number;
  total_plundered: number;
}

export interface OwnerTotal {
  owner_display: string;
  lifetime_plunder: number;
}
