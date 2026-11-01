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
import { GRENADA_PARISH_BOUNDARIES } from "@/data/grenada-boundaries";
import { buildParishFillPaint } from "@/lib/desk/cap/parish-fill-paint";

/** Grenada + Carriacou/Petite Martinique, with a little sea margin. */
export const GRENADA_BOUNDS: [[number, number], [number, number]] = [
  [-61.85, 11.95],
  [-61.35, 12.58],
];

export const PARISH_FILL_LAYER_ID = "cap-parish-fill";
export const PARISH_LINE_LAYER_ID = "cap-parish-line";

// Land must stand clearly off the sea in both themes: a darker sand fill on
// the light sea, and a lighter khaki fill on the dark sea, each with an
// outline that reads as a boundary rather than a faint seam.
const LAND_LIGHT = "#d9cdaf";
const LAND_LINE_LIGHT = "#6f5f3a";
const SEA_LIGHT = "#e7f3fb";
const LAND_DARK = "#4d4129";
const LAND_LINE_DARK = "#c2aa72";
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
  /** Parishes to paint in `selectedColour`; everything else keeps the flat land tone. */
  parishHighlight?: { ids: readonly string[]; colour: string };
}

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
  parishHighlight,
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
              "fill-color": buildParishFillPaint({
                landColour: dark ? LAND_DARK : LAND_LIGHT,
                selectedIds: parishHighlight?.ids ?? [],
                selectedColour: parishHighlight?.colour ?? "",
              }),
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
            "line-width": 1.4,
          }}
          type="line"
        />
      </Source>
      {children}
    </MapLibreMap>
  );
}
