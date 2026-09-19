"use client";

import type { CapAreaCreate, CapSeverity } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import { Check, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useMemo, useState } from "react";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import { Layer, Source } from "react-map-gl/maplibre";
import {
  GRENADA_PARISH_BOUNDARIES,
  GRENADA_PARISHES,
} from "@/data/cap/grenada-boundaries";
import {
  buildCircleArea,
  buildGeocodeArea,
  buildPolygonArea,
  type CircleArea,
  circleToRingCoordinates,
  parishNames,
} from "@/lib/cap-areas";
import { SEVERITY_HEX } from "@/lib/cap-severity";
import { CapMap, PARISH_FILL_LAYER_ID } from "./cap-map";

type AreaMode = "GEOCODE" | "CIRCLE" | "POLYGON";

const MODES: { label: string; value: AreaMode }[] = [
  { label: "Parishes", value: "GEOCODE" },
  { label: "Circle", value: "CIRCLE" },
  { label: "Polygon", value: "POLYGON" },
];

export interface AreaPickerProps {
  onAreasChange: (areas: CapAreaCreate[]) => void;
  severity: CapSeverity;
}

/**
 * CAP's area model has three real shapes — geocode, circle, polygon — and the
 * legacy tool (a raw lat/lon text field) only ever exposed them as typing.
 * This picks one shape at a time and renders it on the real bundled Grenada
 * boundary map. Every mode ends in a plain CapAreaCreate[] the parent form
 * posts as-is; there is no separate "visual" model to keep in sync.
 */
export function AreaPicker({ onAreasChange, severity }: AreaPickerProps) {
  const [mode, setMode] = useState<AreaMode>("GEOCODE");
  const [parishIds, setParishIds] = useState<string[]>([]);
  const [circle, setCircle] = useState<CircleArea | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [areaDescEdited, setAreaDescEdited] = useState<string | null>(null);
  const inputId = useId();

  const autoDesc = useMemo(() => {
    if (mode === "GEOCODE") {
      return parishNames(parishIds).join(", ");
    }
    if (mode === "CIRCLE" && circle) {
      const parish = parishAt(circle.lon, circle.lat);
      const centre = `${circle.lat.toFixed(2)}°N, ${Math.abs(circle.lon).toFixed(2)}°W`;
      return `${circle.radiusKm} km radius${parish ? ` near ${parish}` : ""} (${centre})`;
    }
    if (mode === "POLYGON" && polygonPoints.length >= 3) {
      return `Custom area (${polygonPoints.length}-point polygon)`;
    }
    return "";
  }, [mode, parishIds, circle, polygonPoints]);

  const areaDesc = areaDescEdited ?? autoDesc;

  const areas = useMemo<CapAreaCreate[]>(() => {
    if (mode === "GEOCODE") {
      const area = buildGeocodeArea(parishIds);
      return area ? [{ ...area, area_desc: areaDesc || area.area_desc }] : [];
    }
    if (mode === "CIRCLE" && circle) {
      return [buildCircleArea(circle, areaDesc || autoDesc)];
    }
    if (mode === "POLYGON" && polygonPoints.length >= 3) {
      const area = buildPolygonArea(polygonPoints, areaDesc || autoDesc);
      return area ? [area] : [];
    }
    return [];
  }, [mode, parishIds, circle, polygonPoints, areaDesc, autoDesc]);

  useEffect(() => {
    onAreasChange(areas);
  }, [areas, onAreasChange]);

  function switchMode(next: AreaMode) {
    setMode(next);
    setAreaDescEdited(null);
  }

  function toggleParish(id: string) {
    setAreaDescEdited(null);
    setParishIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  const fillColor = severity ? SEVERITY_HEX[severity] : SEVERITY_HEX.Unknown;

  return (
    <div className="space-y-4">
      <div className="flex w-fit gap-1 rounded-lg bg-gm-surface-muted p-1">
        {MODES.map((item) => (
          <button
            aria-pressed={mode === item.value}
            className="relative rounded-md px-3.5 py-1.5 font-semibold text-body-sm leading-body-sm"
            key={item.value}
            onClick={() => switchMode(item.value)}
            type="button"
          >
            {mode === item.value ? (
              <motion.span
                className="absolute inset-0 rounded-md bg-card shadow-card"
                layoutId="area-mode-fill"
                transition={{ type: "spring", stiffness: 500, damping: 34 }}
              />
            ) : null}
            <span
              className="relative z-10"
              style={{
                color:
                  mode === item.value
                    ? "var(--gm-navy)"
                    : "var(--gm-text-muted)",
              }}
            >
              {item.label}
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <AnimatePresence>
          {mode === "GEOCODE" ? (
            <ModeFade key="geocode-list">
              <div className="flex flex-col gap-1.5">
                {GRENADA_PARISHES.map((parish) => {
                  const selected = parishIds.includes(parish.id);
                  return (
                    <button
                      aria-pressed={selected}
                      className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-body-sm leading-body-sm"
                      key={parish.id}
                      onClick={() => toggleParish(parish.id)}
                      style={{
                        borderColor: selected ? fillColor : "var(--gm-border)",
                        background: selected
                          ? `color-mix(in srgb, ${fillColor} 10%, var(--gm-surface-page))`
                          : "var(--gm-surface-page)",
                        color: selected
                          ? fillColor
                          : "var(--gm-text-secondary)",
                        fontWeight: selected ? 700 : 500,
                      }}
                      type="button"
                    >
                      {parish.shortName}
                      {selected ? (
                        <Check aria-hidden="true" className="size-3.5" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </ModeFade>
          ) : null}

          {mode === "CIRCLE" ? (
            <ModeFade key="circle-controls">
              <div className="flex flex-col gap-3">
                <p className="text-body-sm text-gm-text-muted leading-body-sm">
                  Click the map to place the centre.
                </p>
                {circle ? (
                  <div className="space-y-2">
                    <Label htmlFor={`${inputId}-radius`}>
                      Radius — {circle.radiusKm} km
                    </Label>
                    <input
                      className="w-full"
                      id={`${inputId}-radius`}
                      max={50}
                      min={1}
                      onChange={(event) =>
                        setCircle((prev) =>
                          prev
                            ? { ...prev, radiusKm: Number(event.target.value) }
                            : prev
                        )
                      }
                      step={1}
                      type="range"
                      value={circle.radiusKm}
                    />
                    <p className="font-mono text-gm-text-muted text-micro leading-micro">
                      circle: {circle.lat.toFixed(4)},{circle.lon.toFixed(4)}{" "}
                      {circle.radiusKm}
                    </p>
                  </div>
                ) : (
                  <p className="text-body-sm text-gm-text-secondary leading-body-sm">
                    No centre placed yet.
                  </p>
                )}
              </div>
            </ModeFade>
          ) : null}

          {mode === "POLYGON" ? (
            <ModeFade key="polygon-controls">
              <div className="flex flex-col gap-3">
                <p className="text-body-sm text-gm-text-muted leading-body-sm">
                  Click the map to add vertices; a shape needs at least 3.
                </p>
                <p className="font-mono text-gm-text-secondary text-micro leading-micro">
                  {polygonPoints.length} point
                  {polygonPoints.length === 1 ? "" : "s"}
                </p>
                <Button
                  disabled={polygonPoints.length === 0}
                  onClick={() => setPolygonPoints((prev) => prev.slice(0, -1))}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RotateCcw aria-hidden="true" />
                  Remove last point
                </Button>
                <Button
                  disabled={polygonPoints.length === 0}
                  onClick={() => setPolygonPoints([])}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Clear
                </Button>
              </div>
            </ModeFade>
          ) : null}
        </AnimatePresence>

        <div className="space-y-2">
          <AreaMap
            circle={circle}
            fillColor={fillColor}
            mode={mode}
            onCircleClick={(lat, lon) =>
              setCircle((prev) => ({ lat, lon, radiusKm: prev?.radiusKm ?? 5 }))
            }
            onParishClick={toggleParish}
            onPolygonClick={(lon, lat) =>
              setPolygonPoints((prev) => [...prev, [lon, lat]])
            }
            parishIds={parishIds}
            polygonPoints={polygonPoints}
          />
          <div className="rounded-md bg-gm-surface-panel px-3 py-2">
            <Label
              className="text-gm-text-muted text-micro"
              htmlFor={`${inputId}-desc`}
            >
              areaDesc
            </Label>
            <Input
              className="mt-1 border-none bg-transparent p-0 text-body-sm shadow-none focus-visible:ring-0"
              id={`${inputId}-desc`}
              onChange={(event) => setAreaDescEdited(event.target.value)}
              placeholder="Describe the area…"
              value={areaDesc}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeFade({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      initial={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.15 }}
    >
      {children}
    </motion.div>
  );
}

function parishAt(lon: number, lat: number): string | undefined {
  const feature = GRENADA_PARISH_BOUNDARIES.features.find((candidate) =>
    booleanPointInPolygon([lon, lat], candidate)
  );
  return feature
    ? GRENADA_PARISHES.find((parish) => parish.id === feature.properties.id)
        ?.shortName
    : undefined;
}

function AreaMap({
  mode,
  parishIds,
  fillColor,
  circle,
  polygonPoints,
  onParishClick,
  onCircleClick,
  onPolygonClick,
}: {
  circle: CircleArea | null;
  fillColor: string;
  mode: AreaMode;
  onCircleClick: (lat: number, lon: number) => void;
  onParishClick: (id: string) => void;
  onPolygonClick: (lon: number, lat: number) => void;
  parishIds: string[];
  polygonPoints: [number, number][];
}) {
  const parishFillPaint = useMemo(
    () => [
      "match",
      ["get", "id"],
      ...parishIds.flatMap((id) => [id, fillColor]),
      "#ede6d6",
    ],
    [parishIds, fillColor]
  );

  function handleClick(event: MapLayerMouseEvent) {
    if (mode === "GEOCODE") {
      const id = event.features?.[0]?.properties?.id as string | undefined;
      if (id) {
        onParishClick(id);
      }
      return;
    }
    if (mode === "CIRCLE") {
      onCircleClick(event.lngLat.lat, event.lngLat.lng);
      return;
    }
    onPolygonClick(event.lngLat.lng, event.lngLat.lat);
  }

  const circleRing =
    mode === "CIRCLE" && circle ? circleToRingCoordinates(circle) : null;

  return (
    <div className="overflow-hidden rounded-lg border border-gm-border">
      <CapMap
        cursor={mode === "GEOCODE" ? "pointer" : "crosshair"}
        height={320}
        interactiveLayerIds={mode === "GEOCODE" ? [PARISH_FILL_LAYER_ID] : []}
        onClick={handleClick}
        parishFillPaint={mode === "GEOCODE" ? parishFillPaint : undefined}
      >
        {circleRing ? (
          <Source
            data={{
              type: "Feature",
              properties: {},
              geometry: { type: "Polygon", coordinates: [circleRing] },
            }}
            id="cap-circle"
            type="geojson"
          >
            <Layer
              id="cap-circle-fill"
              paint={{ "fill-color": fillColor, "fill-opacity": 0.28 }}
              type="fill"
            />
            <Layer
              id="cap-circle-line"
              paint={{
                "line-color": fillColor,
                "line-width": 2,
                "line-dasharray": [2, 2],
              }}
              type="line"
            />
          </Source>
        ) : null}
        {mode === "POLYGON" && polygonPoints.length >= 3 ? (
          <Source
            data={{
              type: "Feature",
              properties: {},
              geometry: {
                type: "Polygon",
                coordinates: [[...polygonPoints, polygonPoints[0]]],
              },
            }}
            id="cap-polygon"
            type="geojson"
          >
            <Layer
              id="cap-polygon-fill"
              paint={{ "fill-color": "#37a3ef", "fill-opacity": 0.3 }}
              type="fill"
            />
            <Layer
              id="cap-polygon-line"
              paint={{ "line-color": "#0f70b5", "line-width": 2 }}
              type="line"
            />
          </Source>
        ) : null}
        {mode === "POLYGON" &&
        polygonPoints.length > 0 &&
        polygonPoints.length < 3 ? (
          <Source
            data={{
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: polygonPoints },
            }}
            id="cap-polygon-draft"
            type="geojson"
          >
            <Layer
              id="cap-polygon-draft-line"
              paint={{
                "line-color": "#0f70b5",
                "line-width": 2,
                "line-dasharray": [2, 2],
              }}
              type="line"
            />
          </Source>
        ) : null}
      </CapMap>
    </div>
  );
}
