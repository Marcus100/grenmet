import type {
  CapAreaCreate,
  CapNameValue,
  GmsCataloguePublic,
} from "@barrelsgd/api-client";

export interface CirclePoint {
  lat: number;
  lon: number;
}

export interface CircleArea extends CirclePoint {
  radiusKm: number;
}

/** The parish list and the geocode system come from the API catalogue (see cap-hazards.ts). */
function parishById(catalogue: GmsCataloguePublic) {
  return new Map(catalogue.parishes.map((parish) => [parish.id, parish]));
}

export function parishNames(
  catalogue: GmsCataloguePublic,
  parishIds: readonly string[]
): string[] {
  const byId = parishById(catalogue);
  return parishIds
    .map((id) => byId.get(id)?.name)
    .filter((name): name is string => Boolean(name));
}

/** kind: "GEOCODE" — one geocode per selected parish, human-readable areaDesc built from the same list. */
export function buildGeocodeArea(
  catalogue: GmsCataloguePublic,
  parishIds: readonly string[]
): CapAreaCreate | null {
  if (parishIds.length === 0) {
    return null;
  }
  const byId = parishById(catalogue);
  const geocodes: CapNameValue[] = parishIds
    .map((id) => byId.get(id))
    .filter((parish): parish is GmsCataloguePublic["parishes"][number] =>
      Boolean(parish)
    )
    .map((parish) => ({
      value_name: catalogue.geocode_name,
      value: parish.iso_code,
    }));
  if (geocodes.length === 0) {
    return null;
  }
  return {
    kind: "GEOCODE",
    area_desc: parishNames(catalogue, parishIds).join(", "),
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
