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
        aria-pressed={viewMode === "flat"}
      >
        ▦ FLAT
      </button>
      <button
        type="button"
        className={`vt-btn${viewMode === "globe" ? " active" : ""}`}
        onClick={() => onChange("globe")}
        aria-pressed={viewMode === "globe"}
      >
        ◉ GLOBE
      </button>
    </div>
  );
}
