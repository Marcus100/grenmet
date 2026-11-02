import type {
  CapAlertListPublic,
  CapAlertListPublicView,
  CapAlertPublic,
  CapAlertPublicView,
  CapAreaPublic,
  CapInfoPublic,
} from "@barrelsgd/api-client";
import {
  capAlertListPublicSchema,
  capAlertListPublicViewSchema,
  capAlertPublicViewSchema,
} from "@barrelsgd/api-client";
import { notFound } from "next/navigation";
import { getAuthApiPrefix, getCapApiBaseUrl } from "@/lib/auth-config";
import { reportError } from "@/lib/report-error";

// CAP data types come from the OpenAPI-generated client so they can never drift
// from the FastAPI schemas. The cap UI refers to them by these local aliases.
export type { CapLifecycleState, CapSeverity } from "@barrelsgd/api-client";

export type CapArea = CapAreaPublic;
export type CapInfo = CapInfoPublic;
/** The staff view (GET /api/v1/cap/alerts): every field, including the schema flag. */
export type CapAlert = CapAlertPublic;
export type CapAlertList = CapAlertListPublic;
/** An alert as the anonymous public feeds carry it (no staff-only fields). */
export type CapPublicAlert = CapAlertPublicView;
export type CapPublicAlertList = CapAlertListPublicView;

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

/**
 * One read of a public CAP feed: its data, or `unavailable` when the feed
 * could not be reached or did not answer as expected. An unavailable feed is
 * never an empty list: an outage must not read as "no active alerts".
 */
export type CapFeed<T> = { status: "ok"; value: T } | { status: "unavailable" };

export function capPublicUrl(path: string): string {
  return new URL(path, getCapApiBaseUrl()).toString();
}

export function getLatestActiveAlerts(): Promise<CapFeed<CapPublicAlertList>> {
  return fetchCapJson("/api/cap/latest-active", (payload) =>
    capAlertListPublicViewSchema.parse(payload)
  );
}

export function getPastAlerts(): Promise<CapFeed<CapPublicAlertList>> {
  return fetchCapJson("/api/cap/past", (payload) =>
    capAlertListPublicViewSchema.parse(payload)
  );
}

export function getAllPublicAlerts(): Promise<CapFeed<CapPublicAlertList>> {
  return fetchCapJson("/api/cap/alerts", (payload) =>
    capAlertListPublicViewSchema.parse(payload)
  );
}

export async function getAlertByIdentifier(
  identifier: string
): Promise<CapPublicAlert> {
  const response = await fetch(
    capPublicUrl(`/api/cap/alerts/${encodeURIComponent(identifier)}`),
    {
      cache: "no-store",
    }
  );
  if (response.status === 404) {
    notFound();
  }
  if (!response.ok) {
    notFound();
  }
  const parsed = capAlertPublicViewSchema.safeParse(await response.json());
  if (!parsed.success) {
    notFound();
  }
  return parsed.data;
}

export function getActiveMap(): Promise<CapFeed<GeoJSONFeatureCollection>> {
  return fetchCapJson("/api/cap/active-map", parseGeoJSONFeatureCollection);
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

/**
 * Reads one public CAP feed. A failure is reported (so the outage is seen)
 * and returned as `unavailable`, which each caller shows as a notice.
 */
async function fetchCapJson<T>(
  path: string,
  parse: (payload: unknown) => T
): Promise<CapFeed<T>> {
  try {
    const response = await fetch(capPublicUrl(path), { cache: "no-store" });
    if (!response.ok) {
      reportError(
        new Error(`CAP feed ${path} responded ${response.status}`),
        "cap-feed"
      );
      return { status: "unavailable" };
    }
    return { status: "ok", value: parse(await response.json()) };
  } catch (error) {
    reportError(error, "cap-feed");
    return { status: "unavailable" };
  }
}

/** A CAP time in Grenada time, labelled AST: "Oct 29, 2026, 10:30 PM AST". */
export function formatDateTime(value: string | null): string {
  if (!value) {
    return "Not set";
  }
  const formatted = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Grenada",
  }).format(new Date(value));
  return `${formatted} AST`;
}

export function primaryInfo(alert: { info?: CapInfo[] }): CapInfo | undefined {
  return alert.info?.[0];
}
