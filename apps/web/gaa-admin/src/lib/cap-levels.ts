import type {
  CapNameValue,
  CapSeverity,
  GmsColour,
} from "@barrelsgd/api-client";

/**
 * GMS product and impact colour, per the impact-based forecasting guidelines
 * (September 2026): hazard, product and colour are separate decisions. They
 * travel as CAP parameters; the rules live in
 * apps/api/fastapi/src/cap/levels.py and this file mirrors them for the
 * composer.
 */
export const GMS_PRODUCTS = [
  "Outlook",
  "Watch",
  "Warning",
  "Advisory",
] as const;
export type GmsProduct = (typeof GMS_PRODUCTS)[number];

export const PRODUCT_LABEL: Record<GmsProduct, string> = {
  Outlook: "Outlook",
  Watch: "Watch",
  Warning: "Warning",
  Advisory: "Small Craft Advisory",
};

export const GMS_COLOURS: readonly GmsColour[] = [
  "green",
  "yellow",
  "orange",
  "red",
];

export const COLOUR_LABEL: Record<GmsColour, string> = {
  green: "Green",
  yellow: "Yellow",
  orange: "Orange",
  red: "Red",
};

/** MeteoAlarm awareness code and the CAP severity each colour asserts. */
const AWARENESS: Record<GmsColour, { code: number; severity: CapSeverity }> = {
  green: { code: 1, severity: "Minor" },
  yellow: { code: 2, severity: "Moderate" },
  orange: { code: 3, severity: "Severe" },
  red: { code: 4, severity: "Extreme" },
};

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

export function severityForColour(colour: GmsColour): CapSeverity {
  return AWARENESS[colour].severity;
}

export function awarenessValue(colour: GmsColour): string {
  const { code, severity } = AWARENESS[colour];
  return `${code}; ${colour}; ${severity}`;
}

/** An Outlook's colour is "not yet assigned"; every other product needs one. */
export function needsColour(product: GmsProduct): boolean {
  return product !== "Outlook";
}

export function levelParameters(
  product: GmsProduct,
  colour: GmsColour | null
): CapNameValue[] {
  const parameters: CapNameValue[] = [
    { value_name: PRODUCT_PARAMETER, value: product },
  ];
  if (colour && needsColour(product)) {
    parameters.push({
      value_name: AWARENESS_PARAMETER,
      value: awarenessValue(colour),
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
  event: string,
  product: GmsProduct | null,
  colour: GmsColour | null
): string {
  const title = productTitle(event, product) || "Untitled hazard";
  if (product === "Outlook") {
    return `Outlook · ${title}`;
  }
  return colour ? `${COLOUR_LABEL[colour]} · ${title}` : title;
}
