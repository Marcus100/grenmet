/**
 * Impact-Based Forecasting (IBF) assessment types.
 */

import type { ISODateTimeString } from "@/db/schema/primitives";

export type LikelihoodLevel =
  | "Very Low"
  | "Low"
  | "Medium"
  | "High"
  | "Very High";

export type ImpactSeverity =
  | "None"
  | "Minor"
  | "Moderate"
  | "Major"
  | "Extreme";

export type ResponseLevel =
  | "Monitor"
  | "Be Aware"
  | "Be Prepared"
  | "Take Action"
  | "Avoid / Evacuate";

export type Sector =
  | "general_public"
  | "aviation"
  | "marine"
  | "agriculture"
  | "health"
  | "transport"
  | "tourism"
  | "utilities";

export interface IBFHazard {
  hazard_type: string;
  qualifiers?: string[];
}

export interface IBFSectorImpact {
  details: string;
  sector: Sector;
  severity: ImpactSeverity;
}

export interface IBFAssessment {
  applies_to:
    | { type: "product"; product_id: string }
    | { type: "tropical_system"; product_id: string; system_id: string };
  confidence: { level: "Low" | "Medium" | "High"; notes: string };
  hazards: IBFHazard[];
  ibf_assessment_id: string;
  impact: {
    severity: ImpactSeverity;
    summary: string;
    sector_impacts: IBFSectorImpact[];
  };
  likelihood: { level: LikelihoodLevel; rationale: string };
  response: { level: ResponseLevel; recommended_actions: string[] };
  timing: { onset_local: ISODateTimeString; end_local: ISODateTimeString };
}

import { z } from "zod";
import { isoDateTimeStringSchema } from "@/db/schema/zod-primitives";

export const likelihoodLevelSchema = z.enum([
  "Very Low",
  "Low",
  "Medium",
  "High",
  "Very High",
]);
export const impactSeveritySchema = z.enum([
  "None",
  "Minor",
  "Moderate",
  "Major",
  "Extreme",
]);
export const responseLevelSchema = z.enum([
  "Monitor",
  "Be Aware",
  "Be Prepared",
  "Take Action",
  "Avoid / Evacuate",
]);
export const sectorSchema = z.enum([
  "general_public",
  "aviation",
  "marine",
  "agriculture",
  "health",
  "transport",
  "tourism",
  "utilities",
]);

export const ibfHazardSchema = z.object({
  hazard_type: z.string(),
  qualifiers: z.array(z.string()).optional(),
});

export const ibfSectorImpactSchema = z.object({
  sector: sectorSchema,
  severity: impactSeveritySchema,
  details: z.string(),
});

export const ibfAssessmentSchema = z.object({
  ibf_assessment_id: z.string(),
  applies_to: z.union([
    z.object({ type: z.literal("product"), product_id: z.string() }),
    z.object({
      type: z.literal("tropical_system"),
      product_id: z.string(),
      system_id: z.string(),
    }),
  ]),
  hazards: z.array(ibfHazardSchema),
  likelihood: z.object({
    level: likelihoodLevelSchema,
    rationale: z.string(),
  }),
  impact: z.object({
    severity: impactSeveritySchema,
    summary: z.string(),
    sector_impacts: z.array(ibfSectorImpactSchema),
  }),
  response: z.object({
    level: responseLevelSchema,
    recommended_actions: z.array(z.string()),
  }),
  confidence: z.object({
    level: z.enum(["Low", "Medium", "High"]),
    notes: z.string(),
  }),
  timing: z.object({
    onset_local: isoDateTimeStringSchema,
    end_local: isoDateTimeStringSchema,
  }),
});
