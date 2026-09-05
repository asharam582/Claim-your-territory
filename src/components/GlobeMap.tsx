"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { requiredPrice, formatMoney } from "@/lib/pricing";
import { globeAltitude } from "@/lib/viewport";
import type { Board, Spot } from "@/lib/types";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

// react-globe.gl must not be SSR'd (it accesses window/WebGL).
const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

const LAND = "#19342c";
const DEFAULT_OWNED = "#dff550";

interface Props {
  board: Board;
  spots: Record<string, Spot>;
  features: FeatureCollection<Geometry, GeoJsonProperties>;
  zoomT: number;
  center: [number, number];
  flashKey: string | null;
  onPick: (spotId: string) => void;
  onZoomChange: (zoomT: number) => void;
  onCenterChange: (center: [number, number]) => void;
}

export default function GlobeMap({
  board,
  spots,
  features,
  zoomT,
  center,
  flashKey,
  onPick,
  onZoomChange,
  onCenterChange,
}: Props) {
  const byKey: Record<string, Spot> = {};
  for (const s of Object.values(spots)) byKey[s.key] = s;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globeRef = useRef<any>(null);
  const hasInteracted = useRef(false);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    spot: Spot;
  } | null>(null);

  // Auto-rotate until first user interaction.
  useEffect(() => {
    const el = globeRef.current;
    if (!el) return;
    const controls = el.controls?.();
    if (!controls) return;
    controls.autoRotate = !hasInteracted.current;
    controls.autoRotateSpeed = 0.3;
  });

  // Sync zoom from parent state to globe.
  useEffect(() => {
    const el = globeRef.current;
    if (!el) return;
    const alt = globeAltitude(zoomT);
    el.pointOfView({ lat: center[1], lng: center[0], altitude: alt }, 400);
  }, [zoomT, center]);

  // Stop auto-rotation on first interaction.
  const onInteract = useCallback(() => {
    if (hasInteracted.current) return;
    hasInteracted.current = true;
    const controls = globeRef.current?.controls?.();
    if (controls) controls.autoRotate = false;
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polygonCapColor = useCallback(
    (feat: any) => {
      const key = String(feat.id ?? feat.properties?.iso_n3 ?? "");
      const spot = byKey[key];
      if (!spot?.owner_display) return LAND;
      if (key === flashKey) return "#ffffff";
      return spot.color || DEFAULT_OWNED;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spots, flashKey],
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onPolygonClick = useCallback(
    (feat: any) => {
      const key = String(feat.id ?? feat.properties?.iso_n3 ?? "");
      const spot = byKey[key];
      if (spot) onPick(spot.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spots, onPick],
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polygonLabel = useCallback(
    (feat: any) => {
      const key = String(feat.id ?? feat.properties?.iso_n3 ?? "");
      const spot = byKey[key];
      if (!spot) return "";
      const price = requiredPrice(spot, Number(board.multiplier));
      const action = spot.owner_display ? "conquer" : "claim";
      return `<div style="padding:6px 10px;background:#10221dee;border:1px solid #27463c;border-radius:10px;font-size:13px;color:#eff4e9">
        <div style="font-weight:700">${spot.label}</div>
        <div>${formatMoney(price, board.currency)} <span style="color:#6f8d7e">to ${action}</span></div>
        ${spot.owner_display ? `<div style="color:#6f8d7e">held by ${spot.owner_display}</div>` : ""}
      </div>`;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spots, board],
  );

  return (
    <div
      className="globe-wrap"
      onMouseLeave={() => setHover(null)}
      onPointerDown={onInteract}
      onWheel={(e) => {
        e.stopPropagation();
        onInteract();
        // Scroll → zoom (convert to normalized zoomT change).
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        onZoomChange(Math.max(0, Math.min(1, zoomT + delta)));
      }}
    >
      <Globe
        ref={globeRef}
        globeImageUrl=""
        backgroundColor="#0a0f0a"
        showAtmosphere={true}
        atmosphereColor="#a8ff3a"
        atmosphereAltitude={0.15}
        polygonsData={features.features}
        polygonCapColor={polygonCapColor}
        polygonSideColor={() => "rgba(0,0,0,0.15)"}
        polygonStrokeColor={() => "#0a0f0a"}
        polygonAltitude={0.01}
        polygonLabel={polygonLabel}
        onPolygonClick={onPolygonClick}
        width={typeof window !== "undefined" ? window.innerWidth * 0.65 : 800}
        height={typeof window !== "undefined" ? window.innerHeight - 60 : 600}
      />
    </div>
  );
}
