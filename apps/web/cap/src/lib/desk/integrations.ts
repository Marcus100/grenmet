/**
 * Plain words for the integrations status page. A channel is only described
 * as working when the API says so; "not_configured" and missing data never
 * read as success. Pure, so the wording is unit-tested.
 */
export type IntegrationRecord = Readonly<Record<string, unknown>>;

export interface IntegrationGroupSpec {
  /** Shown when the group has no rows, saying what that means. */
  readonly empty: string;
  readonly fields: readonly string[];
  /** Key in the API response. */
  readonly key: string;
  readonly title: string;
}

export const INTEGRATION_GROUPS: readonly IntegrationGroupSpec[] = [
  {
    empty: "No publish channel is reported.",
    fields: ["name", "status", "reason"],
    key: "publish_channels",
    title: "Publishing channels",
  },
  {
    empty: "Not configured: no webhook endpoint is set up.",
    fields: ["name", "url", "status", "event_types"],
    key: "webhooks",
    title: "Webhooks",
  },
  {
    empty: "Not configured: no MQTT broker is set up.",
    fields: ["name", "host", "port", "topic", "status", "delivery"],
    key: "mqtt_brokers",
    title: "MQTT brokers",
  },
  {
    empty: "No job events have been recorded.",
    fields: ["kind", "status", "attempts", "created_at"],
    key: "job_events",
    title: "Recent job events",
  },
];

/** What a status value means in words. Unknown values are shown as they are. */
export function statusLabel(value: unknown): string {
  if (value === "not_configured") return "Not configured";
  if (value === null || value === undefined || value === "") {
    return "Not reported";
  }
  return String(value).replaceAll("_", " ");
}

export function fieldValue(record: IntegrationRecord, field: string): string {
  const value = record[field];
  if (value === null || value === undefined) return "Not reported";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (field === "status" || field === "delivery") return statusLabel(value);
  if (field === "created_at" && typeof value === "string") return value;
  return String(value);
}

/** Records for one group, or an empty list when the API omits the key. */
export function groupRecords(
  response: Readonly<Record<string, readonly IntegrationRecord[] | undefined>>,
  key: string
): readonly IntegrationRecord[] {
  return response[key] ?? [];
}
