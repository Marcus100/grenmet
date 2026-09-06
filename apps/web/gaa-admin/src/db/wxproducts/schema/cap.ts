/**
 * Common Alerting Protocol (CAP) v1.2 types.
 * Spec: https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2-os.html
 */

import type { ISODateTimeString } from "@/db/wxproducts/schema/primitives";

// ─── Enumerations ─────────────────────────────────────────────────────────────

export type CAPStatus = "Actual" | "Exercise" | "System" | "Test" | "Draft";

/** Alert, Update, Cancel: require <references>. Ack/Error: acknowledgement/rejection. */
export type CAPMsgType = "Alert" | "Update" | "Cancel" | "Ack" | "Error";

export type CAPScope = "Public" | "Restricted" | "Private";

export type CAPCategory =
  | "Geo" // Geophysical (including landslide)
  | "Met" // Meteorological (including flood)
  | "Safety" // General emergency and public safety
  | "Security" // Law enforcement, military, homeland security
  | "Rescue" // Rescue and recovery
  | "Fire" // Fire suppression and rescue
  | "Health" // Medical and public health
  | "Env" // Pollution and other environmental
  | "Transport" // Public and private transportation
  | "Infra" // Utility, telecom, non-transport infrastructure
  | "CBRNE" // Chemical, Biological, Radiological, Nuclear, High-Yield Explosive
  | "Other";

export type CAPResponseType =
  | "Shelter" // Take shelter in place or per <instruction>
  | "Evacuate" // Relocate as instructed
  | "Prepare" // Make preparations per <instruction>
  | "Execute" // Execute a pre-planned activity
  | "Avoid" // Avoid the subject event
  | "Monitor" // Attend to information sources
  | "Assess" // Evaluate the information; SHOULD NOT be used in public warnings
  | "AllClear" // Threat no longer present
  | "None";

export type CAPUrgency =
  | "Immediate"
  | "Expected"
  | "Future"
  | "Past"
  | "Unknown";
export type CAPSeverity =
  | "Extreme"
  | "Severe"
  | "Moderate"
  | "Minor"
  | "Unknown";
export type CAPCertainty =
  | "Observed"
  | "Likely"
  | "Possible"
  | "Unlikely"
  | "Unknown";

/** Name–value pair used for eventCode, parameter, and geocode elements. */
export interface CAPNameValue {
  value: string;
  valueName: string;
}

// ─── Resource ─────────────────────────────────────────────────────────────────

/** Supplemental resource referenced by a <info> block (0..n per info). */
export interface CAPResource {
  /** Base-64 encoded content; for broadcast/one-way links where URI retrieval is infeasible. */
  derefUri?: string;
  /** SHA-1 hex hash of the resource content for integrity verification. */
  digest?: string;
  /** MIME content type per RFC 2046 (e.g. "image/png"). */
  mimeType: string;
  /** Human-readable description of the resource content. */
  resourceDesc: string;
  /** File size in bytes. */
  size?: number;
  /** Full absolute URI to retrieve the resource. */
  uri?: string;
}

// ─── Area ─────────────────────────────────────────────────────────────────────

/** Geographic area associated with a <info> block (0..n per info). */
export interface CAPArea {
  /** Minimum altitude in feet above MSL per WGS84. */
  altitude?: number;
  /** Human-readable description of the affected area. */
  areaDesc: string;
  /** Maximum altitude in feet above MSL; MUST NOT appear without altitude. */
  ceiling?: number;
  /** "lat,lon radius" format; radius in kilometres. */
  circle?: string[];
  /** Geographic code(s) identifying the area (e.g. FIPS, SAME, ZIP). */
  geocode?: CAPNameValue[];
  /**
   * Whitespace-delimited WGS84 "lat,lon" decimal degree pairs.
   * Minimum 4 pairs; first and last must be identical (closed polygon).
   */
  polygon?: string[];
}

// ─── Info ─────────────────────────────────────────────────────────────────────

/** Event description block (0..n per alert; typically one per language). */
export interface CAPInfo {
  area?: CAPArea[];
  audience?: string;
  /** Subject event category (1..n). */
  category: CAPCategory[];
  certainty: CAPCertainty;
  contact?: string;
  description?: string;
  /** Effective start time of the information. */
  effective?: ISODateTimeString;
  /** Human-readable type/name of the event. */
  event: string;
  /** System-specific event identifier(s). */
  eventCode?: CAPNameValue[];
  /** Expiry time of the information. */
  expires?: ISODateTimeString;
  /** Brief headline. Recommended maximum: 160 characters. */
  headline?: string;
  instruction?: string;
  /** RFC 3066 language code. Default: "en-US". */
  language?: string;
  /** Expected beginning time of the subject event. */
  onset?: ISODateTimeString;
  /** System-specific additional parameter(s). */
  parameter?: CAPNameValue[];
  resource?: CAPResource[];
  /** Recommended action for the audience (0..n). */
  responseType?: CAPResponseType[];
  /** Human-readable name of the issuing agency/organisation. */
  senderName?: string;
  severity: CAPSeverity;
  urgency: CAPUrgency;
  /** Full absolute URI for additional information. */
  web?: string;
}

// ─── Alert (root) ─────────────────────────────────────────────────────────────

/** CAP 1.2 alert message (root element). */
export interface CAPAlert {
  /** Space-delimited intended recipients. Required when scope = "Private". */
  addresses?: string;
  /** Special handling code(s) for the message. */
  code?: string[];
  /** Unique message ID; no spaces, commas, <, or &. */
  identifier: string;
  /** Space-separated related incident identifiers. */
  incidents?: string;
  info?: CAPInfo[];
  msgType: CAPMsgType;
  /** Clarifying text; exercise identifier (Exercise) or rejection reason (Error) goes here. */
  note?: string;
  /** Space-separated "sender,identifier,sent" triples. Required for Update/Cancel/Ack/Error. */
  references?: string;
  /** Distribution limitation text. Required when scope = "Restricted". */
  restriction?: string;
  scope: CAPScope;
  /** Globally unique identifier of originating system (recommended: Internet domain name). */
  sender: string;
  /** Message origination time. Format: YYYY-MM-DDThh:mm:ss±hh:mm (Z forbidden; UTC = -00:00). */
  sent: ISODateTimeString;
  /** Human-readable identifier of the source system or operator. */
  source?: string;
  status: CAPStatus;
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

import { z } from "zod";
import { isoDateTimeStringSchema } from "@/db/wxproducts/schema/zod-primitives";

export const capNameValueSchema = z.object({
  valueName: z.string(),
  value: z.string(),
});

export const capResourceSchema = z.object({
  resourceDesc: z.string(),
  mimeType: z.string(),
  size: z.number().int().optional(),
  uri: z.url().optional(),
  derefUri: z.string().optional(),
  digest: z.string().optional(),
});

export const capAreaSchema = z.object({
  areaDesc: z.string(),
  polygon: z.array(z.string()).optional(),
  circle: z.array(z.string()).optional(),
  geocode: z.array(capNameValueSchema).optional(),
  altitude: z.number().optional(),
  ceiling: z.number().optional(),
});

export const capCategorySchema = z.enum([
  "Geo",
  "Met",
  "Safety",
  "Security",
  "Rescue",
  "Fire",
  "Health",
  "Env",
  "Transport",
  "Infra",
  "CBRNE",
  "Other",
]);

export const capResponseTypeSchema = z.enum([
  "Shelter",
  "Evacuate",
  "Prepare",
  "Execute",
  "Avoid",
  "Monitor",
  "Assess",
  "AllClear",
  "None",
]);

export const capInfoSchema = z.object({
  language: z.string().optional(),
  category: z.array(capCategorySchema).min(1),
  event: z.string(),
  responseType: z.array(capResponseTypeSchema).optional(),
  urgency: z.enum(["Immediate", "Expected", "Future", "Past", "Unknown"]),
  severity: z.enum(["Extreme", "Severe", "Moderate", "Minor", "Unknown"]),
  certainty: z.enum(["Observed", "Likely", "Possible", "Unlikely", "Unknown"]),
  audience: z.string().optional(),
  eventCode: z.array(capNameValueSchema).optional(),
  effective: isoDateTimeStringSchema.optional(),
  onset: isoDateTimeStringSchema.optional(),
  expires: isoDateTimeStringSchema.optional(),
  senderName: z.string().optional(),
  headline: z.string().max(160).optional(),
  description: z.string().optional(),
  instruction: z.string().optional(),
  web: z.url().optional(),
  contact: z.string().optional(),
  parameter: z.array(capNameValueSchema).optional(),
  resource: z.array(capResourceSchema).optional(),
  area: z.array(capAreaSchema).optional(),
});

export const capAlertSchema = z.object({
  identifier: z.string(),
  sender: z.string(),
  sent: isoDateTimeStringSchema,
  status: z.enum(["Actual", "Exercise", "System", "Test", "Draft"]),
  msgType: z.enum(["Alert", "Update", "Cancel", "Ack", "Error"]),
  source: z.string().optional(),
  scope: z.enum(["Public", "Restricted", "Private"]),
  restriction: z.string().optional(),
  addresses: z.string().optional(),
  code: z.array(z.string()).optional(),
  note: z.string().optional(),
  references: z.string().optional(),
  incidents: z.string().optional(),
  info: z.array(capInfoSchema).optional(),
});

// ─── Bundle (custom wrapper, not part of CAP spec) ────────────────────────────

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

// ─── Drizzle ORM tables ───────────────────────────────────────────────────────

import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "@/db/wxproducts/schema/db-helpers";
import { ibfAssessments } from "@/db/wxproducts/schema/ibf";
import { productSuites } from "@/db/wxproducts/schema/product-metadata";

/** Groups CAP alerts issued together for an event. */
export const capBundles = pgTable(
  "cap_bundles",
  (t) => ({
    id: t.integer().generatedAlwaysAsIdentity().primaryKey(),
    capBundleId: t.text().notNull(),
    suiteId: t.text().references(() => productSuites.suiteId),
    issuedAtUtc: t.timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  }),
  (table) => [
    uniqueIndex("cap_bundles_bundle_id_idx").on(table.capBundleId),
    index("cap_bundles_suite_id_idx").on(table.suiteId),
  ]
);

/**
 * Individual CAP alert. ibfAssessmentId is NOT NULL — no CAP without IBF.
 */
export const capAlerts = pgTable(
  "cap_alerts",
  (t) => ({
    id: t.integer().generatedAlwaysAsIdentity().primaryKey(),
    capAlertId: t.text().notNull(),
    bundleId: t
      .integer()
      .notNull()
      .references(() => capBundles.id),
    ibfAssessmentId: t
      .text()
      .notNull()
      .references(() => ibfAssessments.ibfAssessmentId),
    body: t.jsonb().$type<CAPAlert>().notNull(),
    issuedAtUtc: t.timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  }),
  (table) => [
    uniqueIndex("cap_alerts_alert_id_idx").on(table.capAlertId),
    index("cap_alerts_bundle_id_idx").on(table.bundleId),
    index("cap_alerts_ibf_assessment_id_idx").on(table.ibfAssessmentId),
  ]
);

export type CapBundleRow = typeof capBundles.$inferSelect;
export type CapBundleRowInsert = typeof capBundles.$inferInsert;
export type CapAlertRow = typeof capAlerts.$inferSelect;
export type CapAlertRowInsert = typeof capAlerts.$inferInsert;
