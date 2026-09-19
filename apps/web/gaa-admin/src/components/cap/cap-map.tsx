"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AttributionControl,
  Layer,
  type LayerProps,
  type MapLayerMouseEvent,
  Map as MapLibreMap,
  type MapRef,
  NavigationControl,
  ScaleControl,
  Source,
} from "react-map-gl/maplibre";
import { GRENADA_PARISH_BOUNDARIES } from "@/data/cap/grenada-boundaries";

/** Grenada + Carriacou/Petite Martinique, with a little sea margin. */
export const GRENADA_BOUNDS: [[number, number], [number, number]] = [
  [-61.85, 11.95],
  [-61.35, 12.58],
];

export const PARISH_FILL_LAYER_ID = "cap-parish-fill";
export const PARISH_LINE_LAYER_ID = "cap-parish-line";

const LAND_LIGHT = "#ede6d6";
const LAND_LINE_LIGHT = "#c8bfa4";
const SEA_LIGHT = "#e7f3fb";
const LAND_DARK = "#3a3122";
const LAND_LINE_DARK = "#5b4d35";
const SEA_DARK = "#0d1e30";

/**
 * No basemap tile source: maplibre-gl and react-map-gl are already
 * dependencies here, but no pmtiles/vector-tile hosting exists yet (see the
 * CAP editor redesign notes). Rendering only the bundled Grenada parish
 * GeoJSON as WebGL vector layers keeps this fully self-contained — it works
 * offline and never depends on a third-party tile CDN being up, which
 * matters for a hazard-warning tool.
 */
function useBlankOceanStyle(dark: boolean) {
  return useMemo(
    () => ({
      version: 8 as const,
      sources: {},
      layers: [
        {
          id: "cap-ocean-bg",
          type: "background" as const,
          paint: { "background-color": dark ? SEA_DARK : SEA_LIGHT },
        },
      ],
    }),
    [dark]
  );
}

export interface CapMapProps {
  children?: ReactNode;
  cursor?: string;
  height?: number | string;
  interactiveLayerIds?: string[];
  mapRef?: React.Ref<MapRef>;
  onClick?: (event: MapLayerMouseEvent) => void;
  onMouseMove?: (event: MapLayerMouseEvent) => void;
  /** Data-driven fill paint for the parish layer — defaults to a flat land tone. Pass a ["match", ["get","id"], ...] expression to colour selected parishes. */
  parishFillPaint?: MaplibreExpression;
}

/**
 * A MapLibre paint value: a literal colour, or a style-spec expression array.
 * The real type (`DataDrivenPropertyValueSpecification`) lives in
 * `@maplibre/maplibre-gl-style-spec`, a transitive dependency we don't
 * declare directly — this local alias avoids importing an undeclared
 * package just for a type.
 */
export type MaplibreExpression = string | readonly unknown[];

/**
 * MapLibre's style JSON can't consume CSS custom properties or React
 * context, so this reads the same `.dark` class @barrelsgd/theme's
 * preferences store toggles on <html> — directly, via a MutationObserver —
 * rather than depending on that store's context provider being mounted
 * above every consumer (composer tests render CapMap in isolation).
 */
function useIsDarkMode(): boolean {
  const [dark, setDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() =>
      setDark(root.classList.contains("dark"))
    );
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export function CapMap({
  children,
  cursor,
  height = 340,
  parishFillPaint,
  interactiveLayerIds,
  mapRef,
  onClick,
  onMouseMove,
}: CapMapProps) {
  const dark = useIsDarkMode();
  const mapStyle = useBlankOceanStyle(dark);

  return (
    <MapLibreMap
      attributionControl={false}
      cursor={cursor}
      initialViewState={{
        bounds: GRENADA_BOUNDS,
        fitBoundsOptions: { padding: 20 },
      }}
      interactiveLayerIds={interactiveLayerIds ?? [PARISH_FILL_LAYER_ID]}
      mapStyle={mapStyle}
      onClick={onClick}
      onMouseMove={onMouseMove}
      ref={mapRef}
      style={{ height, width: "100%" }}
    >
      <NavigationControl
        position="top-right"
        showCompass
        visualizePitch={false}
      />
      <ScaleControl position="bottom-left" unit="metric" />
      <AttributionControl
        compact
        customAttribution="Boundaries: geoBoundaries, © OpenStreetMap contributors"
        position="bottom-right"
      />
      <Source data={GRENADA_PARISH_BOUNDARIES} id="cap-parishes" type="geojson">
        <Layer
          id={PARISH_FILL_LAYER_ID}
          paint={
            {
              "fill-color": parishFillPaint ?? (dark ? LAND_DARK : LAND_LIGHT),
              "fill-opacity": 1,
              // MapLibre's real paint type (DataDrivenPropertyValueSpecification)
              // lives in an undeclared transitive package — narrow the cast
              // through unknown rather than pull that package in for one type.
            } as unknown as NonNullable<
              Extract<LayerProps, { type: "fill" }>["paint"]
            >
          }
          type="fill"
        />
        <Layer
          id={PARISH_LINE_LAYER_ID}
          paint={{
            "line-color": dark ? LAND_LINE_DARK : LAND_LINE_LIGHT,
            "line-width": 1.2,
          }}
          type="line"
        />
      </Source>
      {children}
    </MapLibreMap>
  );
}
