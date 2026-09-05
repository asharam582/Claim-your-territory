"use client";

import type { ViewMode } from "@/lib/viewport";

export default function ViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="view-toggle">
      <button
        type="button"
        className={`vt-btn${viewMode === "flat" ? " active" : ""}`}
        onClick={() => onChange("flat")}
      >
        ▦ FLAT
      </button>
      <button
        type="button"
        className={`vt-btn${viewMode === "globe" ? " active" : ""}`}
        onClick={() => onChange("globe")}
      >
        ◉ GLOBE
      </button>
    </div>
  );
}
