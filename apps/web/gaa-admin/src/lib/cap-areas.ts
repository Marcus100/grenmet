import type { CapAreaCreate, CapNameValue } from "@barrelsgd/api-client";
import { GRENADA_PARISHES } from "@/data/cap/grenada-boundaries";

/** CAP's own geocode name for a parish/dependency code — mirrors how NWS uses "UGC" or "FIPS6" as the geocode value_name. */
export const PARISH_GEOCODE_NAME = "ISO3166-2:GD";

export interface CirclePoint {
  lat: number;
  lon: number;
}

export interface CircleArea extends CirclePoint {
  radiusKm: number;
}

const PARISH_BY_ID = new Map(
  GRENADA_PARISHES.map((parish) => [parish.id, parish])
);

export function parishNames(parishIds: readonly string[]): string[] {
  return parishIds
    .map((id) => PARISH_BY_ID.get(id)?.name)
    .filter((name): name is string => Boolean(name));
}

/** kind: "GEOCODE" — one geocode per selected parish, human-readable areaDesc built from the same list. */
export function buildGeocodeArea(
  parishIds: readonly string[]
): CapAreaCreate | null {
  if (parishIds.length === 0) {
    return null;
  }
  const geocodes: CapNameValue[] = parishIds
    .map((id) => PARISH_BY_ID.get(id))
    .filter((parish): parish is (typeof GRENADA_PARISHES)[number] =>
      Boolean(parish)
    )
    .map((parish) => ({
      value_name: PARISH_GEOCODE_NAME,
      value: parish.isoCode,
    }));
  if (geocodes.length === 0) {
    return null;
  }
  return {
    kind: "GEOCODE",
    area_desc: parishNames(parishIds).join(", "),
    geocodes,
  };
}

/** kind: "CIRCLE" — CAP's native point-radius representation; lat/lon in decimal degrees, radius in km. */
export function buildCircleArea(
  circle: CircleArea,
  areaDesc: string
): CapAreaCreate {
  return {
    kind: "CIRCLE",
    area_desc: areaDesc,
    circles: [{ lat: circle.lat, lon: circle.lon, radius: circle.radiusKm }],
  };
}

/** kind: "POLYGON" — a single ring of [lon, lat] pairs, CAP-style (no closing duplicate required by the API). */
export function buildPolygonArea(
  points: readonly [number, number][],
  areaDesc: string
): CapAreaCreate | null {
  if (points.length < 3) {
    return null;
  }
  return {
    kind: "POLYGON",
    area_desc: areaDesc,
    polygons: [points.map(([lon, lat]) => [lon, lat])],
  };
}

/**
 * Approximate a circle as a closed GeoJSON ring for map display only — the
 * persisted CapAreaCreate keeps the exact CAP circle (lat/lon/radius); this is
 * purely so react-map-gl has a polygon to draw. Equirectangular approximation
 * is accurate enough at Grenada's latitude (~12°N) and radii under ~50 km.
 */
export function circleToRingCoordinates(
  circle: CircleArea,
  steps = 64
): [number, number][] {
  const earthRadiusKm = 6371;
  const latRad = (circle.lat * Math.PI) / 180;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLat = (circle.radiusKm / earthRadiusKm) * Math.cos(angle);
    const dLon =
      ((circle.radiusKm / earthRadiusKm) * Math.sin(angle)) / Math.cos(latRad);
    ring.push([
      circle.lon + (dLon * 180) / Math.PI,
      circle.lat + (dLat * 180) / Math.PI,
    ]);
  }
  return ring;
}
