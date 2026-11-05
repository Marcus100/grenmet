import type {
  CapProfileDefinition,
  CapProfileRule,
  CapProfileSubtype,
} from "@barrelsgd/api-client";

/** A new, empty assessment rule. The id is local until the API saves it. */
export function emptyRule(): CapProfileRule {
  return {
    id: crypto.randomUUID(),
    level: "Warning",
    metric: "",
    operator: ">=",
    threshold: null,
    unit: "",
    duration_minutes: null,
    area: "",
    evidence: "",
  };
}

export function emptySubtype(name = "New subtype"): CapProfileSubtype {
  return {
    id: crypto.randomUUID(),
    name,
    categories: ["Met"],
    rules: [],
    impacts: [],
    responses: [],
    affected_groups: [],
  };
}

/**
 * A starting point for a new hazard profile: a flood set with empty wording.
 * It holds no thresholds or response text, so nothing is assumed before GMS
 * has supplied them. The forecaster must fill every field before approval.
 */
export function starterProfile(): CapProfileDefinition {
  return {
    name: "Flood / Heavy Rain",
    family: "Heavy rain and flooding",
    subtypes: [
      "Heavy Rainfall",
      "Flash Flood",
      "River Flood",
      "Urban Flood",
    ].map((name) => emptySubtype(name)),
    templates: ["Advisory", "Watch", "Warning"].map((level) => ({
      level: level as "Advisory" | "Watch" | "Warning",
      headline: "",
      description: "",
      instruction: "",
    })),
    issuing_authority: "",
    reviewing_authority: "",
    contact: "meteorology@gaa.gd; 1-473-444-4142",
    channels: [],
    notes:
      "Working draft. Populate from the GMS impact, response and threshold schema before approval.",
  };
}
