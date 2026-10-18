import Link from "next/link";
import { WARNING_LEVEL_LABEL, type WarningLevel } from "@/lib/alerts";
import type { AlertFeature } from "@/lib/cap-api";
import {
  boundsFor,
  MAP_WIDTH,
  type MapShape,
  projectionFor,
  REFERENCE_PLACES,
  toShape,
} from "@/lib/map-geometry";

const FILL: Record<WarningLevel, string> = {
  none: "fill-gm-warning-green-bg stroke-gm-warning-green-border",
  "be-aware": "fill-gm-warning-yellow-bg stroke-gm-warning-yellow-border",
  "be-prepared": "fill-gm-warning-amber-bg stroke-gm-warning-amber-border",
  "take-action": "fill-gm-warning-red-bg stroke-gm-warning-red-border",
  unknown: "fill-gm-warning-grey-bg stroke-gm-warning-grey-border",
};

/**
 * Active alert areas as a server-rendered SVG. Each area carries a number that
 * matches the list under the map, so the map and the severity text agree and
 * nothing depends on colour alone.
 */
export function AlertMap({ features }: { features: AlertFeature[] }) {
  const projection = projectionFor(boundsFor(features));
  const shapes: { feature: AlertFeature; number: number; shape: MapShape }[] =
    features.map((feature, index) => ({
      feature,
      number: index + 1,
      shape: toShape(feature, projection),
    }));

  return (
    <div className="space-y-4">
      <svg
        aria-labelledby="alert-map-title"
        className="h-auto w-full rounded-gm-card border border-gm-border bg-gm-surface"
        role="img"
        viewBox={`0 0 ${MAP_WIDTH} ${projection.height}`}
      >
        <title id="alert-map-title">
          Map of areas under an active alert. The numbered list below gives the
          same information in text.
        </title>
        {REFERENCE_PLACES.map((place) => {
          const [x, y] = projection.project(place.lon, place.lat);
          return (
            <g className="fill-gm-text-muted" key={place.name}>
              <circle cx={x} cy={y} r={3} />
              <text className="text-caption" x={x + 6} y={y + 4}>
                {place.name}
              </text>
            </g>
          );
        })}
        {shapes.map(({ feature, number, shape }) => (
          <g key={`${feature.properties.identifier}-${number}`}>
            {shape.d ? (
              <path
                className={FILL[shape.level]}
                d={shape.d}
                fillOpacity={0.55}
                strokeWidth={2}
              />
            ) : null}
            {shape.point ? (
              <circle
                className={FILL[shape.level]}
                cx={shape.point[0]}
                cy={shape.point[1]}
                fillOpacity={0.55}
                r={shape.radiusPx ?? 8}
                strokeWidth={2}
              />
            ) : null}
            {shape.label ? (
              <text
                className="fill-gm-text-primary font-bold text-body"
                textAnchor="middle"
                x={shape.label[0]}
                y={shape.label[1] + 5}
              >
                {number}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <p className="text-caption text-gm-text-muted">
        Shapes show alert areas, not coastlines. Place markers are approximate.
      </p>
      <ol className="space-y-2">
        {shapes.map(({ feature, number, shape }) => (
          <li
            className="rounded-gm-card border border-gm-border p-3 text-body-sm"
            key={`${feature.properties.identifier}-${number}`}
          >
            <span className="font-bold">{number}. </span>
            <span className="font-semibold">
              {WARNING_LEVEL_LABEL[shape.level]}
              {shape.severity === "Unknown" ? "" : ` (${shape.severity})`}
            </span>
            {": "}
            <Link
              className="text-gm-blue-ink underline"
              href={`/alerts/${encodeURIComponent(feature.properties.identifier)}`}
              prefetch={false}
            >
              {feature.properties.headline ?? feature.properties.identifier}
            </Link>
            {feature.properties.areaDesc
              ? ` · ${feature.properties.areaDesc}`
              : ""}
            {shape.label ? "" : " · no map shape published"}
          </li>
        ))}
      </ol>
    </div>
  );
}
