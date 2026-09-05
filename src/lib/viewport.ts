"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ViewMode = "flat" | "globe";

const ZOOM_STEPS = 20;
const STORAGE_KEY = "warmap:viewMode";

export interface ViewportState {
  viewMode: ViewMode;
  /** Normalized zoom 0..1 (0 = fully zoomed out, 1 = fully zoomed in). */
  zoomT: number;
  /** Map center [lng, lat]. */
  center: [number, number];
  /** Hovered country key (ISO numeric string). */
  hoveredKey: string | null;
  /** Temporarily flash-highlighted country key (from feed/list click). */
  flashKey: string | null;
}

const DEFAULT_CENTER: [number, number] = [10, 20];
const DEFAULT_ZOOM_T = 0;

export function useMapViewport() {
  const [state, setState] = useState<ViewportState>({
    viewMode: "flat",
    zoomT: DEFAULT_ZOOM_T,
    center: DEFAULT_CENTER,
    hoveredKey: null,
    flashKey: null,
  });

  // Hydrate viewMode from localStorage (client-only, post-mount).
  const didHydrate = useRef(false);
  useEffect(() => {
    if (didHydrate.current) return;
    didHydrate.current = true;
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ViewMode | null;
      if (saved === "globe" || saved === "flat") {
        setState((s) => ({ ...s, viewMode: saved }));
      }
    } catch {
      // localStorage unavailable — stay with default.
    }
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    setState((s) => ({ ...s, viewMode: mode }));
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
  }, []);

  const zoomIn = useCallback(() => {
    setState((s) => ({ ...s, zoomT: Math.min(1, s.zoomT + 1 / ZOOM_STEPS) }));
  }, []);

  const zoomOut = useCallback(() => {
    setState((s) => ({ ...s, zoomT: Math.max(0, s.zoomT - 1 / ZOOM_STEPS) }));
  }, []);

  const resetView = useCallback(() => {
    setState((s) => ({ ...s, zoomT: DEFAULT_ZOOM_T, center: DEFAULT_CENTER }));
  }, []);

  const setCenter = useCallback((center: [number, number]) => {
    setState((s) => ({ ...s, center }));
  }, []);

  const setZoomT = useCallback((zoomT: number) => {
    setState((s) => ({ ...s, zoomT: Math.max(0, Math.min(1, zoomT)) }));
  }, []);

  const setHovered = useCallback((key: string | null) => {
    setState((s) => ({ ...s, hoveredKey: key }));
  }, []);

  const flashCountry = useCallback((key: string) => {
    setState((s) => ({ ...s, flashKey: key }));
    setTimeout(() => {
      setState((s) => (s.flashKey === key ? { ...s, flashKey: null } : s));
    }, 1500);
  }, []);

  const flyTo = useCallback((center: [number, number], zoomT?: number) => {
    setState((s) => ({
      ...s,
      center,
      zoomT: zoomT ?? Math.max(s.zoomT, 0.4),
    }));
  }, []);

  return {
    ...state,
    setViewMode,
    zoomIn,
    zoomOut,
    resetView,
    setCenter,
    setZoomT,
    setHovered,
    flashCountry,
    flyTo,
  };
}

/* ---- Renderer-specific zoom mapping ---- */

/** Flat map: zoomT [0,1] → react-simple-maps zoom [0.8, 8]. */
export function flatZoom(zoomT: number): number {
  return 0.8 + zoomT * (8 - 0.8);
}

/** Globe: zoomT [0,1] ��� camera altitude [2.5 (far) → 0.4 (close)]. Inverted. */
export function globeAltitude(zoomT: number): number {
  return 2.5 - zoomT * (2.5 - 0.4);
}
