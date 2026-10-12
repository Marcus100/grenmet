import type { ProductField } from "@barrelsgd/gms/products";

/** Editor presentation only; FastAPI keeps canonical knots/metres and publication rules. */
const MPH_PER_KNOT = 1852 / 1609.344;
const KMH_PER_KNOT = 1.852;
const FEET_PER_METRE = 1 / 0.3048;
const UNIT_SUFFIX = /\s*\((mph|ft|°C|%|s|km|hPa)\)$/;
const TIDE_CAPTION = /^Tide \d (time|height)$/;
const FIELD_CAPTIONS: Record<string, string> = {
  "Weather summary": "Summary",
  "Maximum temperature": "Max temp",
  "Minimum temperature": "Min temp",
  "Midday temperature at MBIA": "MBIA temp",
  "Expected nighttime minimum": "Night min",
  "Expected daytime maximum": "Day max",
  "Observed nighttime minimum": "Observed min",
  "Observed daytime maximum": "Observed max",
  "Chance of rain": "Rain chance",
  "Direction from": "From",
  "Direction to": "To",
  "Speed from": "Min",
  "Speed to": "Max",
  "Sea state from": "From",
  "Sea state to": "To",
  "Waves from": "Min waves",
  "Waves to": "Max waves",
  "Swell direction": "Swell dir",
  "Swell period": "Period",
  "Swell height": "Swell",
  "Area covered": "Area",
  "Issue date and time (Grenada)": "Issued",
  "Valid from (Grenada)": "Valid from",
  "Valid until (Grenada)": "Valid until",
  "Next update (Grenada)": "Next update",
};

function inputUnit(field: ProductField) {
  if (field.type !== "number") return null;
  if (field.label.endsWith("(kt)"))
    return { canonical: "kt", display: "mph", factor: MPH_PER_KNOT };
  if (field.label.endsWith("(m)"))
    return { canonical: "m", display: "ft", factor: FEET_PER_METRE };
  return null;
}

export function productFieldLabel(field: ProductField): string {
  const unit = inputUnit(field);
  return unit
    ? field.label.replace(`(${unit.canonical})`, `(${unit.display})`)
    : field.label;
}

export function productFieldUnit(field: ProductField): string {
  return UNIT_SUFFIX.exec(productFieldLabel(field))?.[1] ?? "";
}

/** Short visible labels; controls retain their complete accessible label. */
export function productFieldCaption(field: ProductField): string {
  const label = productFieldLabel(field).replace(UNIT_SUFFIX, "");
  const tide = TIDE_CAPTION.exec(label)?.[1];
  if (tide) return tide === "time" ? "Time" : "Height";
  return FIELD_CAPTIONS[label] ?? label;
}

/** Round the display, never the saved value of an untouched input. */
export function productFieldValue(field: ProductField, value = ""): string {
  const unit = inputUnit(field);
  const numeric = parse(value);
  return unit && numeric !== null
    ? String(Number((numeric * unit.factor).toFixed(2)))
    : value;
}

export function productCanonicalValue(
  field: ProductField,
  value: string
): string {
  const unit = inputUnit(field);
  const numeric = parse(value);
  return unit && numeric !== null
    ? String(Number((numeric / unit.factor).toPrecision(15)))
    : value;
}

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
  const [head = 0] = present;
  const first = fmt(head);
  const last = fmt(present.at(-1) ?? head);
  return first === last ? first : `${first}–${last}`;
}

/** Secondary knot and km/h hints for the mph editor, from canonical knots. */
export function windHint(min?: string, max?: string, gust?: string): string {
  const speeds = [parse(min), parse(max)];
  const g = parse(gust);
  const knots = span(speeds);
  const kmh = span(speeds.map((v) => (v === null ? null : v * KMH_PER_KNOT)));
  const parts = knots ? [`≈ ${knots} kt · ${kmh} km/h`] : [];
  if (g !== null) parts.push(`gusts ${Math.round(g)} kt`);
  return parts.join(", ");
}

/** Secondary metre hint for height inputs displayed in feet. */
export function metresHint(...metres: (string | undefined)[]): string {
  const result = span(metres.map(parse), 2);
  return result ? `≈ ${result} m` : "";
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
