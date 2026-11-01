import "server-only";
import {
  type CapAlertPublicView,
  capAlertListPublicViewSchema,
  capAlertPublicViewSchema,
} from "@barrelsgd/api-client";
import { cache } from "react";
import { z } from "zod";
import { env } from "@/lib/env";
import { createFeedClient, type FeedResult } from "@/lib/feed-client";
import { reportError } from "@/lib/report-error";

export type { FeedResult } from "@/lib/feed-client";

const client = createFeedClient({
  baseUrl: env.CAP_API_URL,
  // Reported, never shown: a warning feed that goes down must raise an alert,
  // not only inform whoever happens to be looking at the site.
  onError: (error) => reportError(error, "cap-public-feed"),
});

/**
 * GeoJSON as the API serves it. Only the parts the map draws are validated;
 * a feature without geometry still lists its alert in the text below the map.
 */
const geometrySchema = z.union([
  z.object({
    coordinates: z.array(z.array(z.array(z.number()))),
    type: z.literal("Polygon"),
  }),
  z.object({
    coordinates: z.array(z.array(z.array(z.array(z.number())))),
    type: z.literal("MultiPolygon"),
  }),
  z.object({
    coordinates: z.array(z.number()),
    type: z.literal("Point"),
  }),
]);

export const alertFeatureSchema = z.object({
  geometry: z.union([geometrySchema, z.null()]),
  properties: z.object({
    areaDesc: z.string().nullable().optional(),
    event: z.string().nullable().optional(),
    headline: z.string().nullable().optional(),
    identifier: z.string(),
    radiusKm: z.number().optional(),
    severity: z.string().nullable().optional(),
  }),
});

const featureCollectionSchema = z.object({
  features: z.array(alertFeatureSchema),
});

export type AlertFeature = z.infer<typeof alertFeatureSchema>;
export type AlertFeatures = z.infer<typeof featureCollectionSchema>;

/** Active public alerts (all statuses; callers split Actual from exercises). */
export const fetchActive = cache(
  (): Promise<FeedResult<CapAlertPublicView[]>> =>
    client
      .get("/api/cap/latest-active", capAlertListPublicViewSchema)
      .then(mapList)
);

/** Previously published alerts: expired and cancelled. */
export const fetchPast = cache(
  (): Promise<FeedResult<CapAlertPublicView[]>> =>
    client.get("/api/cap/past", capAlertListPublicViewSchema).then(mapList)
);

/** One alert by CAP identifier. */
export const fetchAlert = cache(
  (identifier: string): Promise<FeedResult<CapAlertPublicView>> =>
    client.get(
      `/api/cap/alerts/${encodeURIComponent(identifier)}`,
      capAlertPublicViewSchema
    )
);

/** Active Actual alerts as map features. */
export const fetchActiveFeatures = cache(
  (): Promise<FeedResult<AlertFeatures>> =>
    client.get("/api/cap/alerts.geojson", featureCollectionSchema)
);

function mapList(
  result: FeedResult<{ data: CapAlertPublicView[] }>
): FeedResult<CapAlertPublicView[]> {
  if (result.status === "ok" || result.status === "stale") {
    return { ...result, data: result.data.data };
  }
  return result;
}
