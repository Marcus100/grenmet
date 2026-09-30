import type { Condition } from "@/lib/forecast-data";
import { cn } from "@/lib/utils";

/** Tiles past this many fold under a disclosure on phones; desktop shows all. */
export const PHONE_TILES = 4;

function Tile({ className, tile }: { className?: string; tile: Condition }) {
  return (
    <div className={cn("min-w-0 bg-gm-scrim px-3 py-2.5", className)}>
      <dt className="font-bold text-gm-text-inverse/85 text-label uppercase leading-label tracking-wider">
        {tile.label}
      </dt>
      <dd className="mt-0.5 font-bold text-body-base tabular-nums leading-body-base">
        {tile.value}
        {tile.detail && (
          <span className="block font-normal text-body-sm text-gm-text-inverse/85 leading-body-sm">
            {tile.detail}
          </span>
        )}
      </dd>
    </div>
  );
}

const GRID =
  "grid grid-cols-2 gap-px overflow-hidden rounded-gm-card lg:grid-cols-3";

/**
 * Reading tiles on the sky hero. On phones the first {@link PHONE_TILES} show
 * and the rest sit under `foldLabel`; from `lg` every tile is in the grid.
 */
export function HeroFacts({
  foldLabel,
  tiles,
}: {
  foldLabel: string;
  tiles: Condition[];
}) {
  if (tiles.length === 0) return null;
  const extra = tiles.slice(PHONE_TILES);
  return (
    <>
      <dl className={GRID}>
        {tiles.map((tile, index) => (
          <Tile
            className={index >= PHONE_TILES ? "hidden lg:block" : undefined}
            key={tile.label}
            tile={tile}
          />
        ))}
      </dl>
      {extra.length > 0 && (
        <details className="group lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-bold text-body-sm leading-body-sm outline-none focus-visible:ring-2 focus-visible:ring-gm-lime [&::-webkit-details-marker]:hidden">
            {foldLabel} ({extra.length})
            <span aria-hidden="true" className="group-open:hidden">
              +
            </span>
            <span aria-hidden="true" className="hidden group-open:inline">
              −
            </span>
          </summary>
          <dl className={GRID}>
            {extra.map((tile) => (
              <Tile key={tile.label} tile={tile} />
            ))}
          </dl>
        </details>
      )}
    </>
  );
}

/** Provenance chip: lime for what was measured, white for what was issued. */
export function SourceChip({
  children,
  kind,
}: {
  children: React.ReactNode;
  kind: "observed" | "forecast";
}) {
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-md px-2 py-1 font-bold text-caption uppercase leading-caption tracking-wider",
        kind === "observed"
          ? "bg-gm-lime text-gm-navy"
          : "bg-gm-text-inverse text-gm-navy"
      )}
    >
      {children}
    </span>
  );
}
