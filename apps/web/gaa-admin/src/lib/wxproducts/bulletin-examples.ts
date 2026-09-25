import {
  emptyProduct,
  isBulletin,
  type ProductKind,
  productFields,
} from "@barrelsgd/gms/products";
/** Illustrative working drafts, never issued records. Publication requires replacing example wording. */
export function bulletinExample(kind: ProductKind, date: string) {
  const values = emptyProduct(kind, date, "10:00");
  if (!isBulletin(kind)) return values;
  for (const f of productFields(kind)) {
    if (f.required && !values[f.key])
      values[f.key] =
        f.options?.[0] ??
        (f.type === "number"
          ? "2"
          : "Complete after reviewing observations and guidance.");
  }
  values.forecaster = "EXAMPLE — not issued";
  values.validTo = `${date}T22:00`;
  values.level = kind === "heat" ? "Yellow" : "Yellow";
  values.notice = kind === "heat" ? "Watch" : "Advisory";
  values.likelihood = "Medium";
  values.impact = "Minor";
  values.synopsis =
    "EXAMPLE ONLY — replace this scenario with the assessed conditions before issuing.";
  values.impacts =
    "Describe the likely impacts in the affected locations, including who or what may be affected.";
  values.response =
    "State the specific action recommended for the assessed impact and its timing.";
  const examples: Partial<Record<ProductKind, Record<string, string>>> = {
    marine: {
      weather: "Example: scattered showers over coastal waters.",
      visibilityMin: "5",
      visibilityMax: "15",
      windDirFrom: "E",
      windSpeedMin: "15",
      windSpeedMax: "20",
      seaStateFrom: "Moderate",
      waveHeightMin: "1.5",
      waveHeightMax: "2.1",
    },
    cyclone: {
      systemName: "Example system",
      position: "Enter the verified centre position and observation time.",
      movement: "Enter direction and speed from the current official advisory.",
      track:
        "Describe the current forecast track and timing; include uncertainty.",
    },
    flood: {
      rainfall:
        "State the expected rainfall range, accumulation period and units.",
      flooding:
        "Identify the affected rivers, roads and flood-prone communities.",
    },
    thunderstorm: {
      storms: "Describe the expected storm window and affected areas.",
      hazards:
        "Identify lightning, rainfall and gust hazards supported by the assessment.",
    },
    wind: {
      windDirFrom: "E",
      windSpeedMin: "20",
      windSpeedMax: "25",
      windGust: "30",
    },
    heat: {
      eventType: "Hot Spell",
      assessmentBasis: "Forecast",
      maxTemperature: "32.5",
      minTemperature: "25",
      consecutiveDays: "2",
      nightRecovery:
        "Assess against the approved nighttime threshold; no threshold is assumed here.",
      healthGuidance:
        "Add approved public-health or activity-specific guidance separately.",
    },
    dust: {
      dust: "Describe the expected dust extent and timing.",
      visibilityMin: "3",
      visibilityMax: "8",
    },
    coastal: {
      swellDir: "N",
      swellPeriod: "12",
      swellHeight: "2.5",
      surge: "Record expected water-level anomalies and confidence.",
      tides: "Identify affected coastlines and relevant high-tide times.",
    },
    tsunami: {
      source: "Enter the verified official source and bulletin reference.",
      eventTime: "Enter the event time with its time zone.",
      location: "Enter the verified location and magnitude.",
      arrival: "Use arrival information from the official source.",
      waveHeight:
        "Use the official assessed wave-height information, with units.",
    },
  };
  return { ...values, ...examples[kind] };
}
