import type {
  CapAlertListPublic,
  CapAlertPublic,
  CapAreaPublic,
  CapInfoPublic,
} from "@grenmet/api-client";
import { notFound } from "next/navigation";
import { getAuthApiPrefix, getCapApiBaseUrl } from "@/lib/auth-config";

// CAP data types come from the OpenAPI-generated client so they can never drift
// from the FastAPI schemas. The cap UI refers to them by these local aliases.
export type { CapLifecycleState, CapSeverity } from "@grenmet/api-client";

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

const EMPTY_ALERT_LIST: CapAlertList = { data: [], count: 0 };
const EMPTY_FEATURE_COLLECTION: GeoJSONFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function capPublicUrl(path: string): string {
  return new URL(path, getCapApiBaseUrl()).toString();
}

export function getLatestActiveAlerts(): Promise<CapAlertList> {
  return fetchCapJson("/api/cap/latest-active", EMPTY_ALERT_LIST);
}

export function getPastAlerts(): Promise<CapAlertList> {
  return fetchCapJson("/api/cap/past", EMPTY_ALERT_LIST);
}

export function getAllPublicAlerts(): Promise<CapAlertList> {
  return fetchCapJson("/api/cap/alerts", EMPTY_ALERT_LIST);
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
  return (await response.json()) as CapAlert;
}

export function getActiveMap(): Promise<GeoJSONFeatureCollection> {
  return fetchCapJson("/api/cap/active-map", EMPTY_FEATURE_COLLECTION);
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
  return (await response.json()) as CapAlertList;
}

async function fetchCapJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(capPublicUrl(path), { cache: "no-store" });
    if (!response.ok) {
      return fallback;
    }
    return (await response.json()) as T;
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
