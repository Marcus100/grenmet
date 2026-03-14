/**
 * Common Alerting Protocol (CAP) alert and bundle types.
 */

import type { ISODateTimeString } from "@/db/schema/primitives";

export interface CAPAlert {
  area_description: string;
  cap_alert_id: string;
  cap_profile: "CAP 1.2";
  category: string[];
  certainty: "Observed" | "Likely" | "Possible" | "Unlikely" | "Unknown";
  description: string;
  effective_utc: ISODateTimeString;
  event: string;
  expires_utc: ISODateTimeString;
  headline: string;
  instruction: string;
  message_type: "Alert" | "Update" | "Cancel";
  onset_utc: ISODateTimeString;
  references: string[];
  scope: "Public" | "Restricted" | "Private";
  sender: string;
  severity: "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";
  status: "Actual" | "Exercise" | "System" | "Test" | "Draft";
  urgency: "Immediate" | "Expected" | "Future" | "Past" | "Unknown";
}

import { z } from "zod";
import { isoDateTimeStringSchema } from "@/db/schema/zod-primitives";

export const capAlertSchema = z.object({
  cap_alert_id: z.string(),
  cap_profile: z.literal("CAP 1.2"),
  message_type: z.enum(["Alert", "Update", "Cancel"]),
  scope: z.enum(["Public", "Restricted", "Private"]),
  status: z.enum(["Actual", "Exercise", "System", "Test", "Draft"]),
  category: z.array(z.string()),
  event: z.string(),
  urgency: z.enum(["Immediate", "Expected", "Future", "Past", "Unknown"]),
  severity: z.enum(["Extreme", "Severe", "Moderate", "Minor", "Unknown"]),
  certainty: z.enum(["Observed", "Likely", "Possible", "Unlikely", "Unknown"]),
  effective_utc: isoDateTimeStringSchema,
  onset_utc: isoDateTimeStringSchema,
  expires_utc: isoDateTimeStringSchema,
  headline: z.string(),
  description: z.string(),
  instruction: z.string(),
  area_description: z.string(),
  references: z.array(z.string()),
  sender: z.string(),
});

export const capBundleSchema = z.object({
  cap_bundle_id: z.string(),
  linked_product_ids: z.array(z.string()),
  linked_ibf_assessment_ids: z.array(z.string()),
  cap_alerts: z.array(capAlertSchema),
});

export interface CAPBundle {
  cap_alerts: CAPAlert[];
  cap_bundle_id: string;
  linked_ibf_assessment_ids: string[];
  linked_product_ids: string[];
}
