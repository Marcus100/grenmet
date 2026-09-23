import {
  CapAdminHeading,
  CapAdminUnavailable,
} from "@/components/cap/admin-status";
import { loadCapIntegrations } from "@/db/cap/queries";

const groups = [
  {
    key: "webhooks",
    title: "Webhooks",
    fields: ["name", "url", "status", "event_types"],
  },
  {
    key: "mqtt_brokers",
    title: "MQTT brokers",
    fields: ["name", "host", "port", "topic", "status"],
  },
  {
    key: "job_events",
    title: "Recent job events",
    fields: ["kind", "status", "attempts", "created_at"],
  },
];

function displayValue(value: unknown): string {
  if (value == null) return "Not reported";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export default async function IntegrationsPage() {
  let data: Awaited<ReturnType<typeof loadCapIntegrations>>;
  try {
    data = await loadCapIntegrations();
  } catch {
    return <CapAdminUnavailable />;
  }
  return (
    <CapAdminHeading title="CAP integrations">
      <p>
        Configured channels and recent job activity. Configuration or a queued
        job does not prove recipient delivery. This view is read-only.
      </p>
      {groups.map((group) => (
        <section className="space-y-3" key={group.key}>
          <h2 className="font-semibold text-lg">{group.title}</h2>
          {(data[group.key] ?? []).length === 0 ? (
            <p>No records reported.</p>
          ) : null}
          {(data[group.key] ?? []).map((item, index) => (
            <dl
              className="grid gap-2 rounded-lg border p-4 sm:grid-cols-2"
              key={
                typeof item.id === "string" ? item.id : `${group.key}-${index}`
              }
            >
              {group.fields.map((field) => (
                <div key={field}>
                  <dt className="text-muted-foreground text-sm">
                    {field.replaceAll("_", " ")}
                  </dt>
                  <dd className="break-words">{displayValue(item[field])}</dd>
                </div>
              ))}
            </dl>
          ))}
        </section>
      ))}
    </CapAdminHeading>
  );
}
