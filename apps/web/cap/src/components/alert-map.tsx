import Link from "next/link";
import { WARNING_LEVEL_LABEL, type WarningLevel } from "@/lib/alerts";
import type { AlertFeature } from "@/lib/cap-api";
import {
  boundsFor,
  landPath,
  MAP_WIDTH,
  type MapShape,
  projectionFor,
  REFERENCE_PLACES,
  toShape,
} from "@/lib/map-geometry";

/** Room a place label needs to the right of its marker, in map units. */
const LABEL_ROOM = 130;

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
        className="rounded-gm-card border-gm-border bg-gm-surface h-auto w-full border"
        role="img"
        viewBox={`0 0 ${MAP_WIDTH} ${projection.height}`}
      >
        <title id="alert-map-title">
          {features.length > 0
            ? "Map of Grenada, Carriacou and Petite Martinique with the areas under an active alert. The numbered list below gives the same information in text."
            : "Map of Grenada, Carriacou and Petite Martinique. No alert areas are in effect."}
        </title>
        <path
          className="fill-gm-surface-muted stroke-gm-border-input"
          d={landPath(projection)}
          strokeWidth={1}
        />
        {REFERENCE_PLACES.map((place) => {
          const [x, y] = projection.project(place.lon, place.lat);
          // A label near the right edge is drawn to the left of its marker,
          // so it is never cut off.
          const flip = x > MAP_WIDTH - LABEL_ROOM;
          return (
            <g className="fill-gm-text-muted" key={place.name}>
              <circle cx={x} cy={y} r={3} />
              <text
                className="text-caption"
                textAnchor={flip ? "end" : "start"}
                x={flip ? x - 6 : x + 6}
                y={y + 4}
              >
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
                className="fill-gm-text-primary text-body font-bold"
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
        Island outlines are simplified parish boundaries from geoBoundaries (©
        OpenStreetMap contributors), not official boundaries. Place markers are
        approximate.
      </p>
      {shapes.length > 0 ? (
        <ol className="space-y-2">
          {shapes.map(({ feature, number, shape }) => (
            <li
              className="rounded-gm-card border-gm-border text-body-sm border p-3"
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
      ) : null}
    </div>
  );
}
