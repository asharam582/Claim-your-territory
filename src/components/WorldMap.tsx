"use client";

import { useCallback, useState } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { geoCentroid } from "d3-geo";
import { requiredPrice, formatMoney } from "@/lib/pricing";
import { flatZoom } from "@/lib/viewport";
import type { Board, Spot } from "@/lib/types";

interface Props {
  board: Board;
  spots: Record<string, Spot>;
  geographyUrl: string;
  zoomT: number;
  center: [number, number];
  flashKey: string | null;
  onPick: (spotId: string) => void;
  onZoomChange: (zoomT: number) => void;
  onCenterChange: (center: [number, number]) => void;
}

const LAND = "#19342c";
const LAND_HOVER = "#305444";
const DEFAULT_OWNED = "#dff550";

function lightenHex(hex: string): string {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lr = Math.min(255, r + Math.round((255 - r) * 0.25));
    const lg = Math.min(255, g + Math.round((255 - g) * 0.25));
    const lb = Math.min(255, b + Math.round((255 - b) * 0.25));
    return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
  } catch {
    return "#f0ff91";
  }
}

export default function WorldMap({
  board,
  spots,
  geographyUrl,
  zoomT,
  center,
  flashKey,
  onPick,
  onZoomChange,
  onCenterChange,
}: Props) {
  const byKey: Record<string, Spot> = {};
  for (const s of Object.values(spots)) byKey[s.key] = s;

  const [hover, setHover] = useState<{ x: number; y: number; spot: Spot } | null>(null);
  const [hoveredGeoKey, setHoveredGeoKey] = useState<string | null>(null);

  const zoom = flatZoom(zoomT);

  // react-simple-maps v5: coordinates and zoom are optional in the callback.
  const handleMoveEnd = useCallback(
    (pos: { coordinates?: [number, number]; zoom?: number }) => {
      if (pos.coordinates) onCenterChange(pos.coordinates);
      if (pos.zoom != null) {
        const t = (pos.zoom - 0.8) / (8 - 0.8);
        onZoomChange(Math.max(0, Math.min(1, t)));
      }
    },
    [onCenterChange, onZoomChange],
  );

  return (
    <div className="map-wrap" onMouseLeave={() => { setHover(null); setHoveredGeoKey(null); }}>
      <ComposableMap
        projection="geoEqualEarth"
        projectionConfig={{ scale: 165 }}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup
          center={center}
          zoom={zoom}
          maxZoom={8}
          minZoom={0.8}
          onMoveEnd={handleMoveEnd}
        >
          <Geographies geography={geographyUrl}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const geoKey = String(geo.id);
                const spot = byKey[geoKey];
                const owned = !!spot?.owner_display;
                const isFlash = spot && spot.key === flashKey;
                const isHovered = geoKey === hoveredGeoKey;

                const baseFill = isFlash
                  ? "#ffffff"
                  : owned
                    ? (spot.color || DEFAULT_OWNED)
                    : LAND;
                const fill = isHovered && !isFlash
                  ? (owned ? lightenHex(spot.color || DEFAULT_OWNED) : LAND_HOVER)
                  : baseFill;

                const centroid = spot?.logo_url ? geoCentroid(geo) : null;
                return (
                  <g key={geo.rsmKey}>
                    <Geography
                      className="geo"
                      geography={geo}
                      onClick={() => spot && onPick(spot.id)}
                      onMouseEnter={() => setHoveredGeoKey(geoKey)}
                      onMouseMove={(e) =>
                        spot && setHover({ x: e.clientX, y: e.clientY, spot })
                      }
                      onMouseLeave={() => { setHover(null); setHoveredGeoKey(null); }}
                      style={{ fill, stroke: "#07110f", strokeWidth: 0.4, cursor: spot ? "pointer" : "default" }}
                    />
                    {centroid && spot?.logo_url && (
                      <Marker coordinates={centroid as [number, number]}>
                        <image
                          href={spot.logo_url}
                          x={-9}
                          y={-9}
                          width={18}
                          height={18}
                          className="logo-badge"
                          preserveAspectRatio="xMidYMid meet"
                          style={{ pointerEvents: "none" }}
                        />
                      </Marker>
                    )}
                  </g>
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          <div className="t">{hover.spot.label}</div>
          <div className="p">
            {formatMoney(requiredPrice(hover.spot, Number(board.multiplier)), board.currency)}{" "}
            <span className="o">to {hover.spot.owner_display ? "conquer" : "claim"}</span>
          </div>
          {hover.spot.owner_display && (
            <div className="o">held by {hover.spot.owner_display}</div>
          )}
        </div>
      )}
    </div>
  );
}
