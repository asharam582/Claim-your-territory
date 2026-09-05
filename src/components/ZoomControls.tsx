"use client";

import { useEffect } from "react";

export default function ZoomControls({
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  // Keyboard shortcuts: +/- for zoom, 0 for recenter.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't intercept if user is typing in an input/textarea.
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === "+" || e.key === "=") onZoomIn();
      else if (e.key === "-" || e.key === "_") onZoomOut();
      else if (e.key === "0") onReset();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onZoomIn, onZoomOut, onReset]);

  return (
    <div className="zoom-controls">
      <button type="button" className="zoom-btn" onClick={onZoomIn} title="Zoom in (+)">
        +
      </button>
      <button type="button" className="zoom-btn" onClick={onZoomOut} title="Zoom out (-)">
        –
      </button>
      <button type="button" className="zoom-btn zoom-reset" onClick={onReset} title="Reset view (0)">
        ◎
      </button>
    </div>
  );
}
