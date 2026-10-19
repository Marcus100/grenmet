import { type Severity, severityLevel, type WarningLevel } from "@/lib/alerts";
import type { AlertFeature } from "@/lib/cap-api";

// Server-side projection of CAP geometry to inline SVG. No map library and no
// client JavaScript: the map is a plain picture plus a text list of the areas.

export const MAP_WIDTH = 640;

/** The tri-island state: Grenada, Carriacou and Petite Martinique. */
const HOME_BOUNDS = { east: -61.3, north: 12.65, south: 11.9, west: -62.05 };

/** Reference places, so a map with no coastline still has landmarks. */
export const REFERENCE_PLACES = [
  { lat: 12.056, lon: -61.749, name: "St. George's" },
  { lat: 12.488, lon: -61.452, name: "Hillsborough" },
  { lat: 12.517, lon: -61.383, name: "Petite Martinique" },
] as const;

interface Bounds {
  east: number;
  north: number;
  south: number;
  west: number;
}

export interface Projection {
  height: number;
  /** Pixels per kilometre, for drawing circles. */
  pixelsPerKm: number;
  project: (lon: number, lat: number) => [number, number];
  width: number;
}

export interface MapShape {
  d: string | null;
  /** Marker position: centroid of the shape's bounding box. */
  label: [number, number] | null;
  level: WarningLevel;
  point: [number, number] | null;
  radiusPx: number | null;
  severity: Severity | "Unknown";
}

const SEVERITIES = new Set(["Extreme", "Severe", "Moderate", "Minor"]);

export function toSeverity(value: string | null | undefined): Severity {
  return value && SEVERITIES.has(value) ? (value as Severity) : "Unknown";
}

type Position = number[];

function ringPositions(feature: AlertFeature): Position[] {
  const geometry = feature.geometry;
  if (!geometry) {
    return [];
  }
  if (geometry.type === "Point") {
    return [geometry.coordinates];
  }
  if (geometry.type === "Polygon") {
    return geometry.coordinates.flat();
  }
  return geometry.coordinates.flat(2);
}

export function boundsFor(features: AlertFeature[]): Bounds {
  const bounds = { ...HOME_BOUNDS };
  for (const feature of features) {
    for (const [lon, lat] of ringPositions(feature)) {
      if (lon === undefined || lat === undefined) {
        continue;
      }
      bounds.west = Math.min(bounds.west, lon);
      bounds.east = Math.max(bounds.east, lon);
      bounds.south = Math.min(bounds.south, lat);
      bounds.north = Math.max(bounds.north, lat);
    }
  }
  return bounds;
}

const KM_PER_DEGREE = 111.32;

export function projectionFor(bounds: Bounds, width = MAP_WIDTH): Projection {
  const midLat = (bounds.north + bounds.south) / 2;
  const lonScale = Math.cos((midLat * Math.PI) / 180);
  const lonSpan = (bounds.east - bounds.west) * lonScale;
  const latSpan = bounds.north - bounds.south;
  const height = Math.round((width * latSpan) / lonSpan);
  return {
    height,
    pixelsPerKm: width / (lonSpan * KM_PER_DEGREE),
    project: (lon, lat) => [
      round(((lon - bounds.west) * lonScale * width) / lonSpan),
      round(((bounds.north - lat) * height) / latSpan),
    ],
    width,
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function ringPath(ring: Position[], projection: Projection): string {
  const points = ring
    .filter((p) => p[0] !== undefined && p[1] !== undefined)
    .map(([lon, lat]) => projection.project(lon as number, lat as number));
  if (points.length < 3) {
    return "";
  }
  return `M${points.map(([x, y]) => `${x} ${y}`).join("L")}Z`;
}

function boxCentre(
  positions: Position[],
  projection: Projection
): [number, number] | null {
  const projected = positions
    .filter((p) => p[0] !== undefined && p[1] !== undefined)
    .map(([lon, lat]) => projection.project(lon as number, lat as number));
  if (projected.length === 0) {
    return null;
  }
  const xs = projected.map(([x]) => x);
  const ys = projected.map(([, y]) => y);
  return [
    round((Math.min(...xs) + Math.max(...xs)) / 2),
    round((Math.min(...ys) + Math.max(...ys)) / 2),
  ];
}

/** Turns one feature into drawable SVG data. Null geometry yields no shape. */
export function toShape(
  feature: AlertFeature,
  projection: Projection
): MapShape {
  const severity = toSeverity(feature.properties.severity);
  const level = severity === "Unknown" ? "unknown" : severityLevel(severity);
  const geometry = feature.geometry;
  const empty = {
    d: null,
    label: null,
    level,
    point: null,
    radiusPx: null,
    severity,
  } satisfies MapShape;
  if (!geometry) {
    return empty;
  }
  if (geometry.type === "Point") {
    const [lon, lat] = geometry.coordinates;
    if (lon === undefined || lat === undefined) {
      return empty;
    }
    const point = projection.project(lon, lat);
    const radiusKm = feature.properties.radiusKm ?? 0;
    return {
      ...empty,
      label: point,
      point,
      radiusPx: radiusKm > 0 ? round(radiusKm * projection.pixelsPerKm) : null,
    };
  }
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const d = polygons
    .flatMap((polygon) => polygon.map((ring) => ringPath(ring, projection)))
    .filter(Boolean)
    .join("");
  return {
    ...empty,
    d: d || null,
    label: boxCentre(ringPositions(feature), projection),
  };
}
