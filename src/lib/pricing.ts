import type { Spot } from "./types";

/**
 * The price (in cents) required to take a spot right now.
 * - Unclaimed spot: pay its current price (the base "claim" price).
 * - Held spot:      pay ceil(current_price * multiplier), rounded UP to the
 *                   nearest whole dollar so the ladder stays clean ($3 -> $5 -> $8...).
 */
export function requiredPrice(spot: Spot, multiplier: number): number {
  if (!spot.owner_display) return spot.current_price;
  const raw = spot.current_price * multiplier;
  return Math.ceil(raw / 100) * 100;
}

/** Whether taking this spot is a first claim or a steal. */
export function actionKind(spot: Spot): "claim" | "conquer" {
  return spot.owner_display ? "conquer" : "claim";
}

/** Format cents as compact USD: 300 -> "$3", 8650 -> "$86.50". */
export function formatMoney(cents: number, currency = "usd"): string {
  const dollars = cents / 100;
  const whole = Number.isInteger(dollars);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}
