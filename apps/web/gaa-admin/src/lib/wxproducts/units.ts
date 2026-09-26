/**
 * Display-only unit hints for the forecast editor. FastAPI's
 * `src/wxproducts/units.py` is the authority for saved and published text.
 */
const MPH_PER_KNOT = 1852 / 1609.344;
const KMH_PER_KNOT = 1.852;
const FEET_PER_METRE = 1 / 0.3048;

function parse(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function span(values: (number | null)[], places = 0): string {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return "";
  const fmt = (v: number) =>
    places ? String(Number(v.toFixed(places))) : String(Math.round(v));
  const first = fmt(present[0]);
  const last = fmt(present.at(-1) ?? present[0]);
  return first === last ? first : `${first}–${last}`;
}

/** "≈ 12–23 mph · 19–37 km/h, gusts 35 mph" from knot values. */
export function windHint(min?: string, max?: string, gust?: string): string {
  const speeds = [parse(min), parse(max)];
  const g = parse(gust);
  const mph = span(speeds.map((v) => (v === null ? null : v * MPH_PER_KNOT)));
  const kmh = span(speeds.map((v) => (v === null ? null : v * KMH_PER_KNOT)));
  const parts = mph ? [`≈ ${mph} mph · ${kmh} km/h`] : [];
  if (g !== null) parts.push(`gusts ${Math.round(g * MPH_PER_KNOT)} mph`);
  return parts.join(", ");
}

/** "≈ 6–9 ft" from metre values. */
export function feetHint(...metres: (string | undefined)[]): string {
  const feet = span(
    metres.map((v) => {
      const m = parse(v);
      return m === null ? null : m * FEET_PER_METRE;
    })
  );
  return feet ? `≈ ${feet} ft` : "";
}

/** "≈ 2.7–5.4 nmi" from kilometre values. */
export function nauticalMilesHint(...km: (string | undefined)[]): string {
  const nmi = span(
    km.map((v) => {
      const value = parse(v);
      return value === null ? null : value / 1.852;
    }),
    1
  );
  return nmi ? `≈ ${nmi} nmi` : "";
}
