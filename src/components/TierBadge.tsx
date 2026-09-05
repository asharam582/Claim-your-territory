"use client";

import type { Tier } from "@/lib/tiers";
import { TIER_COLORS } from "@/lib/tiers";

export default function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span
      className="tier-badge"
      style={{ borderColor: TIER_COLORS[tier], color: TIER_COLORS[tier] }}
    >
      {tier}
    </span>
  );
}
