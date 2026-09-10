import type {
  CapProfileDefinition,
  CapProfileRule,
  CapProfileSubtype,
} from "@barrelsgd/api-client";

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

/** A working draft only: no locally approved numerical thresholds or response text is assumed. */
export function floodProfile(): CapProfileDefinition {
  return {
    name: "Flood / Heavy Rain",
    family: "Heavy rain and flooding",
    subtypes: [
      "Heavy Rainfall",
      "Flash Flood",
      "River Flood",
      "Urban Flood",
    ].map(emptySubtype),
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
