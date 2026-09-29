import type { Condition, ForecastDayData } from "@/lib/forecast-data";

/** Readings the hero shows elsewhere (high/low tile, the Now panel). */
const SKIP = /^(max temp|min temp|midday observation)/i;
/** What people check first; the rest keep the issued order. */
const PRIORITY = [
  /^chance of rain|^rain chance/i,
  /^wind speed|^wind$/i,
  /^sea state/i,
];

function rank(tile: Condition): number {
  const index = PRIORITY.findIndex((pattern) => pattern.test(tile.label));
  return index === -1 ? PRIORITY.length : index;
}

/** Today's issued figures as hero tiles: high/low first, then by priority. */
export function forecastTiles(day: ForecastDayData): Condition[] {
  const tiles = day.conditions
    .filter((tile) => !SKIP.test(tile.label))
    .map((tile, index) => ({ tile, index }))
    .sort((a, b) => rank(a.tile) - rank(b.tile) || a.index - b.index)
    .map(({ tile }) => tile);
  if (day.high === null && day.low === null) return tiles;
  const format = (value: number | null) => (value === null ? "—" : `${value}°`);
  return [
    { label: "High / Low", value: `${format(day.high)} / ${format(day.low)}` },
    ...tiles,
  ];
}
