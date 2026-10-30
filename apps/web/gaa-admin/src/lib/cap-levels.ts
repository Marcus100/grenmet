import type {
  CapNameValue,
  CapSeverity,
  GmsCataloguePublic,
  GmsColour,
} from "@barrelsgd/api-client";
import { formatSectors, type SectorKey } from "@barrelsgd/gms/sectors";

/**
 * GMS product and impact colour, per the impact-based forecasting guidelines
 * (September 2026): hazard, product and colour are separate decisions. They
 * travel as CAP parameters. The labels, the colour-to-severity pairing and the
 * "an Outlook has no colour" rule are served by the API (GET
 * /api/v1/cap/gms-catalogue, from apps/api/fastapi/src/cap/catalogue.py and
 * levels.py). This file keeps only the presentation and the wire parameter names.
 */
export type GmsProduct = "Outlook" | "Watch" | "Warning" | "Advisory";
export type GmsCatalogue = GmsCataloguePublic;

/** Fill and legible text for each colour (hazard pairs in foundation.css). */
export const COLOUR_SURFACE: Record<
  GmsColour,
  { background: string; color: string }
> = {
  green: {
    background: "var(--gm-risk-green)",
    color: "var(--gm-text-inverse)",
  },
  yellow: {
    background: "var(--gm-risk-yellow)",
    color: "var(--gm-text-primary)",
  },
  orange: {
    background: "var(--gm-risk-amber)",
    color: "var(--gm-text-primary)",
  },
  red: { background: "var(--gm-risk-red)", color: "var(--gm-text-inverse)" },
};

export const AWARENESS_PARAMETER = "awareness_level";
export const PRODUCT_PARAMETER = "GMS:product";
export const SECTORS_PARAMETER = "GMS:sectors";

function colourRule(catalogue: GmsCatalogue, colour: GmsColour) {
  const rule = catalogue.colours.find((item) => item.key === colour);
  if (!rule) {
    throw new Error(`Unknown GMS colour: ${colour}`);
  }
  return rule;
}

export function colourLabel(
  catalogue: GmsCatalogue,
  colour: GmsColour
): string {
  return colourRule(catalogue, colour).label;
}

export function severityForColour(
  catalogue: GmsCatalogue,
  colour: GmsColour
): CapSeverity {
  return colourRule(catalogue, colour).severity;
}

export function awarenessValue(
  catalogue: GmsCatalogue,
  colour: GmsColour
): string {
  const rule = colourRule(catalogue, colour);
  return `${rule.awareness_code}; ${colour}; ${rule.severity}`;
}

export function productLabel(
  catalogue: GmsCatalogue,
  product: GmsProduct
): string {
  return (
    catalogue.products.find((item) => item.key === product)?.label ?? product
  );
}

/** An Outlook's colour is "not yet assigned"; every other product needs one. */
export function needsColour(
  catalogue: GmsCatalogue,
  product: GmsProduct
): boolean {
  return (
    catalogue.products.find((item) => item.key === product)?.needs_colour ??
    true
  );
}

export function levelParameters(
  catalogue: GmsCatalogue,
  product: GmsProduct,
  colour: GmsColour | null
): CapNameValue[] {
  const parameters: CapNameValue[] = [
    { value_name: PRODUCT_PARAMETER, value: product },
  ];
  if (colour && needsColour(catalogue, product)) {
    parameters.push({
      value_name: AWARENESS_PARAMETER,
      value: awarenessValue(catalogue, colour),
    });
  }
  return parameters;
}

const TRAILING_PRODUCT = /\s+(outlook|watch|warning|advisory)$/i;

/** The hazard without a trailing product word: "Heavy Rainfall Watch" → "Heavy Rainfall". */
export function hazardName(event: string): string {
  return event.trim().replace(TRAILING_PRODUCT, "");
}

/**
 * Hazard plus the chosen product: "Heat" + Watch → "Heat Watch". A product
 * word already in the event is replaced, so "Heavy Rainfall Watch" issued as
 * a Warning reads "Heavy Rainfall Warning", never "Watch Warning".
 */
export function productTitle(
  event: string,
  product: GmsProduct | null
): string {
  if (!product) {
    return event.trim();
  }
  const hazard = hazardName(event);
  const suffix = product === "Advisory" ? "Advisory" : product;
  return hazard ? `${hazard} ${suffix}` : "";
}

/** Status-band text for a level: "Orange · Heat Watch" or "Outlook · Heat Outlook". */
export function levelHeading(
  catalogue: GmsCatalogue,
  event: string,
  product: GmsProduct | null,
  colour: GmsColour | null
): string {
  const title = productTitle(event, product) || "Untitled hazard";
  if (product === "Outlook") {
    return `Outlook · ${title}`;
  }
  return colour ? `${colourLabel(catalogue, colour)} · ${title}` : title;
}

/** The optional sector tag; no sectors means no parameter (affects everyone). */
export function sectorParameters(
  sectors: readonly SectorKey[]
): CapNameValue[] {
  const stored = formatSectors(sectors);
  return stored ? [{ value_name: SECTORS_PARAMETER, value: stored }] : [];
}
