import type { GeoJSONFeatureCollection } from "@/lib/cap-api";

interface Point {
  x: number;
  y: number;
}

export function AlertMapPreview({
  featureCollection,
}: {
  featureCollection: GeoJSONFeatureCollection;
}) {
  const polygons = extractPolygons(featureCollection);
  const bounds = getBounds(polygons);
  const paths = polygons.map((polygon) =>
    polygon
      .map((point) => projectPoint(point, bounds))
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ")
      .concat(" Z")
  );

  return (
    <div className="relative min-h-96 overflow-hidden border border-gm-border bg-gm-surface">
      <svg
        aria-label="Active CAP alert map"
        className="absolute inset-0 size-full"
        preserveAspectRatio="xMidYMid meet"
        viewBox="0 0 720 420"
      >
        <defs>
          <pattern
            height="48"
            id="map-grid"
            patternUnits="userSpaceOnUse"
            width="48"
          >
            <path
              className="stroke-gm-border"
              d="M 48 0 L 0 0 0 48"
              fill="none"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect fill="url(#map-grid)" height="420" width="720" />
        <path
          className="fill-gm-surface-panel stroke-gm-blue"
          d="M120 92 C210 36 340 54 465 96 C560 128 640 210 602 288 C558 382 390 390 245 348 C106 308 58 168 120 92Z"
          strokeWidth="2"
        />
        {paths.map((path) => (
          <path
            className="fill-gm-risk-red/[0.32] stroke-gm-risk-red"
            d={path}
            key={path}
            strokeWidth="3"
          />
        ))}
      </svg>
      <div className="absolute right-4 bottom-4 left-4 flex flex-wrap items-center justify-between gap-2 bg-white/90 px-3 py-2 text-gm-body-sm text-gm-text-secondary shadow-gm-card backdrop-blur">
        <span>{featureCollection.features.length} active map features</span>
        <span>GeoJSON / CAP 1.2</span>
      </div>
    </div>
  );
}

function extractPolygons(
  featureCollection: GeoJSONFeatureCollection
): Point[][] {
  const polygons: Point[][] = [];
  for (const feature of featureCollection.features) {
    const geometry = feature.geometry;
    if (!(geometry && "coordinates" in geometry)) {
      continue;
    }
    if (geometry.type === "Polygon") {
      const coordinates = geometry.coordinates as number[][][];
      polygons.push(toPoints(coordinates[0] ?? []));
    }
    if (geometry.type === "MultiPolygon") {
      const coordinates = geometry.coordinates as number[][][][];
      for (const polygon of coordinates) {
        polygons.push(toPoints(polygon[0] ?? []));
      }
    }
  }
  return polygons;
}

function toPoints(coordinates: number[][]): Point[] {
  return coordinates
    .filter((coordinate) => coordinate.length >= 2)
    .map(([lon, lat]) => ({ x: lon, y: lat }));
}

function getBounds(polygons: Point[][]) {
  const points = polygons.flat();
  if (points.length === 0) {
    return { minX: -62.2, maxX: -61.3, minY: 11.7, maxY: 12.7 };
  }
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function projectPoint(
  point: Point,
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
): Point {
  const width = Math.max(bounds.maxX - bounds.minX, 0.1);
  const height = Math.max(bounds.maxY - bounds.minY, 0.1);
  return {
    x: 90 + ((point.x - bounds.minX) / width) * 540,
    y: 350 - ((point.y - bounds.minY) / height) * 260,
  };
}
