/**
 * Cosmetic country tiers — purely display, never affects pricing.
 *
 * Tiers are computed from bundled population data (data/population.json).
 * Thresholds:
 *   S ≥ 100M   (USA, China, India, Brazil, Indonesia, etc.)
 *   A ≥ 30M    (Canada, Saudi Arabia, Poland, etc.)
 *   B ≥ 8M     (Sweden, Austria, Israel, etc.)
 *   C ≥ 1M     (Estonia, Cyprus, Fiji, etc.)
 *   D < 1M     (Iceland, Vanuatu, etc.)
 */

import populationData from "../../data/population.json";

export type Tier = "S" | "A" | "B" | "C" | "D";

const population: Record<string, number> = populationData;

export function tierFor(pop: number): Tier {
  if (pop >= 100_000_000) return "S";
  if (pop >= 30_000_000) return "A";
  if (pop >= 8_000_000) return "B";
  if (pop >= 1_000_000) return "C";
  return "D";
}

/** Get the cosmetic tier for a country by its ISO-numeric key. */
export function tierForKey(key: string): Tier {
  return tierFor(population[key] ?? 500_000);
}

/** Tier colors for badges — matches the vintage-atlas theme. */
export const TIER_COLORS: Record<Tier, string> = {
  S: "#bb4a3c", // terracotta
  A: "#c9963f", // brass
  B: "#3f6f9e", // atlas blue
  C: "#5f8c6e", // sage
  D: "#8a97a8", // faint slate
};
