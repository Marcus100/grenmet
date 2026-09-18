"use client";

import type { CapSeverity } from "@barrelsgd/api-client";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import type { GeoJSONFeatureCollection } from "@/lib/cap-api";
import { circleToRingCoordinates } from "@/lib/cap-areas";
import { SEVERITY_HEX, severityRank } from "@/lib/cap-severity";
import { CapMap } from "./cap-map";

interface AreaProperties {
  headline: string;
  identifier: string;
  severity: CapSeverity;
}

/**
 * Renders the real CAP area geometry the API already computes
 * (geo.py's alerts_to_feature_collection) on the bundled Grenada base map,
 * coloured by severity. A CIRCLE area arrives as a Point + radiusKm — that
 * gets expanded into a real ring client-side so it reads at the correct
 * geographic scale instead of a fixed-pixel dot.
 *
 * Areas selected purely by parish geocode (no polygon/circle geometry) have
 * no shape to draw yet — same limitation the free-text area model had before
 * this redesign. They still show correctly in the alert list beside the map.
 */
export function AlertMapPreview({
  featureCollection,
}: {
  featureCollection: GeoJSONFeatureCollection;
}) {
  const areaFeatures = useMemo(
    () => toAreaFeatures(featureCollection),
    [featureCollection]
  );
  const bySeverity = useMemo(
    () => groupBySeverity(areaFeatures),
    [areaFeatures]
  );

  return (
    <div className="relative overflow-hidden border border-gm-border">
      <CapMap height={420}>
        {bySeverity.map(([severity, collection]) => (
          <Source
            data={collection}
            id={`cap-active-${severity}`}
            key={severity}
            type="geojson"
          >
            <Layer
              id={`cap-active-${severity}-fill`}
              paint={{
                "fill-color": SEVERITY_HEX[severity],
                "fill-opacity": 0.38,
              }}
              type="fill"
            />
            <Layer
              id={`cap-active-${severity}-line`}
              paint={{ "line-color": SEVERITY_HEX[severity], "line-width": 2 }}
              type="line"
            />
          </Source>
        ))}
      </CapMap>
      <div className="pointer-events-none absolute right-4 bottom-4 left-4 flex flex-wrap items-center justify-between gap-2 bg-card/90 px-3 py-2 text-body-sm text-gm-text-secondary shadow-card backdrop-blur">
        <span>{featureCollection.features.length} active map features</span>
        <span>GeoJSON / CAP 1.2</span>
      </div>
    </div>
  );
}

function toAreaFeatures(
  featureCollection: GeoJSONFeatureCollection
): Feature<Polygon, AreaProperties>[] {
  const features: Feature<Polygon, AreaProperties>[] = [];
  for (const feature of featureCollection.features) {
    const properties: AreaProperties = {
      identifier: String(feature.properties.identifier ?? ""),
      headline: String(feature.properties.headline ?? ""),
      severity:
        (feature.properties.severity as CapSeverity | null) ?? "Unknown",
    };
    const geometry = feature.geometry;
    if (!geometry) {
      continue;
    }
    if (geometry.type === "Polygon") {
      features.push({
        type: "Feature",
        properties,
        geometry: geometry as Polygon,
      });
    } else if (geometry.type === "MultiPolygon") {
      const coordinates = geometry.coordinates as number[][][][];
      for (const polygon of coordinates) {
        features.push({
          type: "Feature",
          properties,
          geometry: { type: "Polygon", coordinates: polygon },
        });
      }
    } else if (geometry.type === "Point") {
      const [lon, lat] = geometry.coordinates as [number, number];
      const radiusKm = Number(feature.properties.radiusKm ?? 0);
      if (radiusKm > 0) {
        const ring = circleToRingCoordinates({ lat, lon, radiusKm });
        features.push({
          type: "Feature",
          properties,
          geometry: { type: "Polygon", coordinates: [ring] },
        });
      }
    }
  }
  return features;
}

function groupBySeverity(
  features: Feature<Polygon, AreaProperties>[]
): [CapSeverity, FeatureCollection<Polygon, AreaProperties>][] {
  const groups = new Map<CapSeverity, Feature<Polygon, AreaProperties>[]>();
  for (const feature of features) {
    const existing = groups.get(feature.properties.severity) ?? [];
    existing.push(feature);
    groups.set(feature.properties.severity, existing);
  }
  // Highest severity drawn last so it sits on top where alerts overlap.
  return [...groups.entries()]
    .sort((a, b) => severityRank(a[0]) - severityRank(b[0]))
    .map(
      ([severity, list]) =>
        [severity, { type: "FeatureCollection", features: list }] as [
          CapSeverity,
          FeatureCollection<Polygon, AreaProperties>,
        ]
    );
}
