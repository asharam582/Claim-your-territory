"use client";

import { useEffect, useRef, useState } from "react";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

type GeoFeatures = FeatureCollection<Geometry, GeoJsonProperties>;

// Module-level cache: once fetched + parsed, survives component re-renders
// and view-mode toggles without refetching. Keyed by URL.
const cache: Record<string, GeoFeatures> = {};

/**
 * Fetch and parse the TopoJSON file ONCE, returning the GeoJSON features.
 * Both the flat map and the globe consume the same object, so toggling
 * view mode never re-fetches or re-parses (acceptance checklist requirement).
 */
export function useCountryGeo(url: string) {
  const [features, setFeatures] = useState<GeoFeatures | null>(cache[url] ?? null);
  const [loading, setLoading] = useState(!cache[url]);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);

  useEffect(() => {
    urlRef.current = url;
    if (cache[url]) {
      setFeatures(cache[url]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load geography: ${r.status}`);
        return r.json();
      })
      .then((topo: Topology) => {
        if (cancelled) return;
        const objectKey = Object.keys(topo.objects)[0];
        const fc = feature(topo, topo.objects[objectKey] as GeometryCollection) as GeoFeatures;
        cache[url] = fc;
        setFeatures(fc);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load geography.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { features, loading, error };
}
