/** Small, dependency-free chart geometry for the server-rendered meteogram. */

export type Nullable = number | null;

/** Grenada is UTC-4 all year (no daylight saving). */
export const GRENADA_UTC_OFFSET_HOURS = -4;

const HOUR_MS = 3_600_000;

export function scaleLinear(
  domain: readonly [number, number],
  range: readonly [number, number]
): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  if (span === 0) return () => (r0 + r1) / 2;
  return (value) => r0 + ((value - d0) / span) * (r1 - r0);
}

/** A rounded step (1, 2, 5 x 10^n) giving about `count` intervals. */
function niceStep(span: number, count: number): number {
  const raw = span / Math.max(count, 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  let nice = 10;
  if (fraction <= 1) nice = 1;
  else if (fraction <= 2) nice = 2;
  else if (fraction <= 5) nice = 5;
  return nice * magnitude;
}

/** Axis extent and tick values that cover the data, or null when there is none. */
export function niceAxis(
  values: readonly Nullable[],
  options: { count?: number; floorZero?: boolean; minSpan?: number } = {}
): { min: number; max: number; ticks: number[] } | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  const { count = 4, floorZero = false, minSpan = 1 } = options;
  let lo = floorZero ? 0 : Math.min(...present);
  let hi = Math.max(...present);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = floorZero ? 0 : mid - minSpan / 2;
    hi = floorZero ? minSpan : mid + minSpan / 2;
  }
  const step = niceStep(hi - lo, count);
  const min = floorZero ? 0 : Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let tick = min; tick <= max + step / 2; tick += step) {
    ticks.push(Number(tick.toFixed(6)));
  }
  return { min, max, ticks };
}

/** SVG path of a polyline that lifts the pen across missing values. */
export function linePath(
  xs: readonly number[],
  ys: readonly Nullable[],
  scaleX: (value: number) => number,
  scaleY: (value: number) => number
): string {
  let path = "";
  let penDown = false;
  ys.forEach((value, index) => {
    const x = xs[index];
    if (value === null || x === undefined) {
      penDown = false;
      return;
    }
    path += `${penDown ? "L" : "M"}${scaleX(x).toFixed(1)} ${scaleY(value).toFixed(1)}`;
    penDown = true;
  });
  return path;
}

/** Epoch ms of every Grenada local midnight inside [start, end]. */
export function localMidnights(start: number, end: number): number[] {
  const offset = GRENADA_UTC_OFFSET_HOURS * HOUR_MS;
  const result: number[] = [];
  let day =
    Math.ceil((start + offset) / (24 * HOUR_MS)) * 24 * HOUR_MS - offset;
  while (day <= end) {
    result.push(day);
    day += 24 * HOUR_MS;
  }
  return result;
}

const weekdayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  timeZone: "America/Grenada",
});

export function formatDay(epoch: number): string {
  return weekdayFormat.format(epoch);
}

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Grenada",
});

export function formatLocal(epoch: number): string {
  return `${timeFormat.format(epoch)} (Grenada)`;
}

/** Compass point for a meteorological direction in degrees. */
export function compass(degrees: number): string {
  const points = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  return points[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16] ?? "N";
}
