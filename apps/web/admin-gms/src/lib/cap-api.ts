import { notFound } from "next/navigation";
import { getCapApiBaseUrl } from "@/lib/auth-config";

export type CapSeverity =
  | "Extreme"
  | "Severe"
  | "Moderate"
  | "Minor"
  | "Unknown";
export type CapLifecycleState =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "PUBLISHED"
  | "EXPIRED"
  | "CANCELLED";

export interface CapArea {
  area_desc: string;
  circles: Record<string, number>[];
  geocodes: { value_name: string; value: string }[];
  geometry: GeoJSONGeometry | null;
  id: string;
  multipolygons: number[][][][];
  polygons: number[][][];
}

export interface CapInfo {
  areas: CapArea[];
  certainty: string;
  contact: string | null;
  description: string;
  effective: string | null;
  event: string;
  expires: string | null;
  headline: string;
  id: string;
  instruction: string | null;
  language: string;
  onset: string | null;
  resources: {
    id: string;
    resource_desc: string;
    mime_type: string;
    uri: string | null;
  }[];
  sender_name: string | null;
  severity: CapSeverity;
  urgency: string;
  web: string | null;
}

export interface CapAlert {
  id: string;
  identifier: string;
  incidents: string[];
  info: CapInfo[];
  lifecycle_state: CapLifecycleState;
  msg_type: string;
  note: string | null;
  scope: string;
  sender: string;
  sent: string;
  status: string;
  xml_url: string | null;
}

export interface CapAlertList {
  count: number;
  data: CapAlert[];
}

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
  return alert.info[0];
}
