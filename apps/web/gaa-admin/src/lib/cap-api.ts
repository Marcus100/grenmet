import type {
  CapAlertListPublic,
  CapAlertPublic,
  CapAreaPublic,
  CapInfoPublic,
} from "@barrelsgd/api-client";
import {
  capAlertListPublicSchema,
  capAlertPublicSchema,
} from "@barrelsgd/api-client";
import { notFound } from "next/navigation";
import { getAuthApiPrefix, getCapApiBaseUrl } from "@/lib/auth-config";

// CAP data types come from the OpenAPI-generated client so they can never drift
// from the FastAPI schemas. The cap UI refers to them by these local aliases.
export type { CapLifecycleState, CapSeverity } from "@barrelsgd/api-client";

export type CapArea = CapAreaPublic;
export type CapInfo = CapInfoPublic;
export type CapAlert = CapAlertPublic;
export type CapAlertList = CapAlertListPublic;

export interface GeoJSONGeometry {
  coordinates?: unknown;
  type: string;
}

export interface GeoJSONFeatureCollection {
  features: {
    type: "Feature";
    geometry: GeoJSONGeometry | null;
    properties: Record<string, unknown>;
  }[];
  type: "FeatureCollection";
}

function parseGeoJSONFeatureCollection(
  payload: unknown
): GeoJSONFeatureCollection {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Invalid CAP active-map response");
  }
  if (!("type" in payload) || payload.type !== "FeatureCollection") {
    throw new Error("Invalid CAP active-map response");
  }
  if (!("features" in payload && Array.isArray(payload.features))) {
    throw new Error("Invalid CAP active-map response");
  }
  const features = payload.features.filter(
    (feature): feature is GeoJSONFeatureCollection["features"][number] =>
      typeof feature === "object" &&
      feature !== null &&
      "type" in feature &&
      feature.type === "Feature" &&
      "geometry" in feature &&
      (feature.geometry === null || typeof feature.geometry === "object") &&
      "properties" in feature &&
      typeof feature.properties === "object" &&
      feature.properties !== null
  );
  if (features.length !== payload.features.length) {
    throw new Error("Invalid CAP active-map response");
  }
  return { type: "FeatureCollection", features };
}

const EMPTY_ALERT_LIST: CapAlertList = { data: [], count: 0 };
const EMPTY_FEATURE_COLLECTION: GeoJSONFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function capPublicUrl(path: string): string {
  return new URL(path, getCapApiBaseUrl()).toString();
}

export function getLatestActiveAlerts(): Promise<CapAlertList> {
  return fetchCapJson("/api/cap/latest-active", EMPTY_ALERT_LIST, (payload) =>
    capAlertListPublicSchema.parse(payload)
  );
}

export function getPastAlerts(): Promise<CapAlertList> {
  return fetchCapJson("/api/cap/past", EMPTY_ALERT_LIST, (payload) =>
    capAlertListPublicSchema.parse(payload)
  );
}

export function getAllPublicAlerts(): Promise<CapAlertList> {
  return fetchCapJson("/api/cap/alerts", EMPTY_ALERT_LIST, (payload) =>
    capAlertListPublicSchema.parse(payload)
  );
}

export async function getAlertByIdentifier(
  identifier: string
): Promise<CapAlert> {
  const response = await fetch(capPublicUrl(`/api/cap/alerts/${identifier}`), {
    cache: "no-store",
  });
  if (response.status === 404) {
    notFound();
  }
  if (!response.ok) {
    notFound();
  }
  const parsed = capAlertPublicSchema.safeParse(await response.json());
  if (!parsed.success) {
    notFound();
  }
  return parsed.data;
}

export function getActiveMap(): Promise<GeoJSONFeatureCollection> {
  return fetchCapJson(
    "/api/cap/active-map",
    EMPTY_FEATURE_COLLECTION,
    parseGeoJSONFeatureCollection
  );
}

/**
 * Fetch the authenticated CAP editor alert list. Unlike the public `/api/cap/*`
 * feeds, `/api/v1/cap/alerts` requires a Bearer access token — the caller
 * exchanges the session cookie for one (see the CAP admin page). Throws on a
 * non-OK response so backend/permission failures surface instead of silently
 * rendering an empty dashboard.
 */
export async function fetchAdminAlerts(
  accessToken: string
): Promise<CapAlertList> {
  const response = await fetch(
    new URL(`${getAuthApiPrefix()}/cap/alerts`, getCapApiBaseUrl()),
    {
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to load CAP alerts (${response.status})`);
  }
  return capAlertListPublicSchema.parse(await response.json());
}

async function fetchCapJson<T>(
  path: string,
  fallback: T,
  parse: (payload: unknown) => T
): Promise<T> {
  try {
    const response = await fetch(capPublicUrl(path), { cache: "no-store" });
    if (!response.ok) {
      return fallback;
    }
    return parse(await response.json());
  } catch {
    return fallback;
  }
}

export function formatDateTime(value: string | null): string {
  if (!value) {
    return "Not set";
  }
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function primaryInfo(alert: CapAlert): CapInfo | undefined {
  return alert.info?.[0];
}
