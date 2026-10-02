import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import type { GeoFile, Ring } from "@/data/types";

/** SVG path for rings in map units; y is flipped so north is up. */
export function ringPath(rings: Ring[]): string {
  return rings
    .map((ring) => `M${ring.map(([x, y]) => `${x},${-y}`).join("L")}Z`)
    .join("");
}

export interface MapRegion {
  /** Constituency code or polling division id. */
  code: string;
  fill: string;
  href?: string;
  /** Accessible name and hover title; say the party in words. */
  title: string;
}

function Region({ region, rings }: { region: MapRegion; rings: Ring[] }) {
  const path = (
    <path
      className="stroke-(--el-paper) [stroke-width:0.06] hover:opacity-80"
      d={ringPath(rings)}
      fill={region.fill}
    >
      <title>{region.title}</title>
    </path>
  );
  return region.href ? (
    <Link aria-label={region.title} href={region.href}>
      {path}
    </Link>
  ) : (
    path
  );
}

/**
 * The 2D map of Grenada, Carriacou and Petite Martinique: the same geometry as
 * the Atlas, as a static SVG. Each region names itself, and links when given
 * an href. Boundaries are illustrative.
 */
export function FlatMap({
  geo,
  level = "cons",
  regions,
  label,
  className,
}: {
  geo: GeoFile;
  level?: "cons" | "div";
  regions: MapRegion[];
  label: string;
  className?: string;
}) {
  const shapes: Record<string, { rings: Ring[] }> =
    level === "div" ? geo.divisions : geo.constituencies;
  const { inset } = geo;

  return (
    <svg
      aria-label={label}
      className={cn("h-auto w-full", className)}
      role="img"
      viewBox="-15.5 -25.5 43 41.5"
    >
      <path d={ringPath(geo.land)} fill="var(--el-land)" />
      {regions.map((region) => {
        const shape = shapes[region.code];
        return shape ? (
          <Region key={region.code} region={region} rings={shape.rings} />
        ) : null;
      })}
      {level === "div" &&
        Object.entries(geo.constituencies).map(([code, shape]) => (
          <path
            d={ringPath(shape.rings)}
            fill="none"
            key={code}
            stroke="var(--el-ink)"
            strokeWidth={0.08}
          />
        ))}
      <rect
        fill="none"
        height={inset.y1 - inset.y0}
        stroke="var(--el-rule-2)"
        strokeDasharray=".5 .35"
        strokeWidth={0.08}
        width={inset.x1 - inset.x0}
        x={inset.x0}
        y={-inset.y1}
      />
    </svg>
  );
}
