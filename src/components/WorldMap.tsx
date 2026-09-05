"use client";

import { useState } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { geoCentroid } from "d3-geo";
import { requiredPrice, formatMoney } from "@/lib/pricing";
import type { Board, Spot } from "@/lib/types";

interface Props {
  board: Board;
  spots: Record<string, Spot>;
  geographyUrl: string;
  onPick: (spotId: string) => void;
}

const LAND = "#19342c";
const LAND_HOVER = "#305444";
const DEFAULT_OWNED = "#dff550";
const DEFAULT_OWNED_HOVER = "#f0ff91";

/** Lighten a hex color by ~25% for hover state. */
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
    return DEFAULT_OWNED_HOVER;
  }
}

export default function WorldMap({ board, spots, geographyUrl, onPick }: Props) {
  const byKey: Record<string, Spot> = {};
  for (const s of Object.values(spots)) byKey[s.key] = s;

  const [hover, setHover] = useState<{ x: number; y: number; spot: Spot } | null>(null);

  return (
    <div className="map-wrap" onMouseLeave={() => setHover(null)}>
      <ComposableMap
        projection="geoEqualEarth"
        projectionConfig={{ scale: 165 }}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup center={[10, 20]} zoom={1} maxZoom={8} minZoom={0.8}>
          <Geographies geography={geographyUrl}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const spot = byKey[String(geo.id)];
                const owned = !!spot?.owner_display;
                const fill = owned ? (spot.color || DEFAULT_OWNED) : LAND;
                const fillHover = owned ? lightenHex(spot.color || DEFAULT_OWNED) : LAND_HOVER;
                const centroid = spot?.logo_url ? geoCentroid(geo) : null;
                return (
                  <g key={geo.rsmKey}>
                    <Geography
                      className="geo"
                      geography={geo}
                      onClick={() => spot && onPick(spot.id)}
                      onMouseMove={(e) =>
                        spot && setHover({ x: e.clientX, y: e.clientY, spot })
                      }
                      onMouseLeave={() => setHover(null)}
                      style={{
                        default: { fill, stroke: "#07110f", strokeWidth: 0.4 },
                        hover: { fill: fillHover, stroke: "#07110f", strokeWidth: 0.4 },
                        pressed: { fill: fillHover },
                      }}
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
