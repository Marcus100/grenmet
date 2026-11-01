import type { CapAreaCreate, GmsCataloguePublic } from "@barrelsgd/api-client";
import { buildGeocodeArea, type CircleArea } from "./cap/cap-areas";

/**
 * Where the area picker starts when a saved draft is edited. A saved area is
 * turned back into a picker selection only when the picker would build the very
 * same area again (parishes, one circle or one polygon). Anything else (several
 * areas, a predefined area, heights, other geocodes) is kept exactly as saved
 * until the forecaster chooses to draw the areas again: an edit must never drop
 * or reshape an area the forecaster did not touch.
 */
export type AreaSelection =
  | { kind: "kept"; areas: CapAreaCreate[] }
  | { kind: "empty" }
  | { kind: "GEOCODE"; parishIds: string[]; areaDesc: string | null }
  | { kind: "CIRCLE"; circle: CircleArea; areaDesc: string }
  | { kind: "POLYGON"; points: [number, number][]; areaDesc: string };

function hasOnly(
  area: CapAreaCreate,
  allowed: ReadonlyArray<"circles" | "geocodes" | "polygons">
): boolean {
  const filled = {
    circles: (area.circles ?? []).length > 0,
    geocodes: (area.geocodes ?? []).length > 0,
    polygons: (area.polygons ?? []).length > 0,
  };
  const extras =
    (area.multipolygons ?? []).length > 0 ||
    Boolean(area.predefined_area_id) ||
    Boolean(area.geometry) ||
    area.altitude != null ||
    area.ceiling != null;
  return (
    !extras &&
    (Object.keys(filled) as Array<keyof typeof filled>).every(
      (key) => allowed.includes(key) || !filled[key]
    )
  );
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function restoreAreaSelection(
  catalogue: GmsCataloguePublic,
  areas: readonly CapAreaCreate[]
): AreaSelection {
  if (areas.length === 0) return { kind: "empty" };
  const kept: AreaSelection = { kind: "kept", areas: [...areas] };
  const area = areas[0];
  if (areas.length !== 1 || !area) return kept;

  if (area.kind === "GEOCODE" && hasOnly(area, ["geocodes"])) {
    const byCode = new Map(catalogue.parishes.map((p) => [p.iso_code, p.id]));
    const geocodes = area.geocodes ?? [];
    const ids = geocodes.map((code) =>
      code.value_name === catalogue.geocode_name
        ? byCode.get(code.value)
        : undefined
    );
    if (ids.length === 0 || ids.some((id) => id === undefined)) return kept;
    const parishIds = ids as string[];
    const rebuilt = buildGeocodeArea(catalogue, parishIds);
    if (!rebuilt) return kept;
    return {
      kind: "GEOCODE",
      parishIds,
      areaDesc: area.area_desc === rebuilt.area_desc ? null : area.area_desc,
    };
  }

  if (area.kind === "CIRCLE" && hasOnly(area, ["circles"])) {
    const circles = area.circles ?? [];
    const circle = circles[0];
    if (circles.length !== 1 || !circle) return kept;
    const lat = asNumber(circle.lat);
    const lon = asNumber(circle.lon);
    const radius = asNumber(circle.radius);
    if (lat === null || lon === null || radius === null) return kept;
    return {
      kind: "CIRCLE",
      circle: { lat, lon, radiusKm: radius },
      areaDesc: area.area_desc,
    };
  }

  if (area.kind === "POLYGON" && hasOnly(area, ["polygons"])) {
    const polygons = area.polygons ?? [];
    const ring = polygons[0];
    if (polygons.length !== 1 || !ring) return kept;
    const points = ring.map((pair) =>
      pair.length === 2 ? [asNumber(pair[0]), asNumber(pair[1])] : [null, null]
    );
    if (
      points.length < 3 ||
      points.some(([a, b]) => a === null || b === null)
    ) {
      return kept;
    }
    return {
      kind: "POLYGON",
      points: points as [number, number][],
      areaDesc: area.area_desc,
    };
  }

  return kept;
}
