import type { Metadata } from "next";
import {
  DeskForbidden,
  DeskRefused,
  DeskUnavailable,
  grenadaTime,
} from "@/components/desk/desk-panels";
import { getIntegrations } from "@/lib/desk/api";
import { requireDeskGate } from "@/lib/desk/gate";
import {
  fieldValue,
  groupRecords,
  INTEGRATION_GROUPS,
  type IntegrationRecord,
} from "@/lib/desk/integrations";
import { reportError } from "@/lib/report-error";

export const metadata: Metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

/**
 * Read-only status of publishing channels. A configured row or a queued job
 * does not prove that anyone received a warning, and the page says so.
 */
export default async function IntegrationsPage() {
  const gate = await requireDeskGate("/desk/integrations");
  if (gate.status === "refused") return <DeskRefused email={gate.email} />;
  if (!gate.permissions.integrationsManage) {
    return (
      <DeskForbidden
        permission="cap.integrations.manage"
        what="CAP integrations"
      />
    );
  }
  let response: Awaited<ReturnType<typeof getIntegrations>>;
  try {
    response = await getIntegrations(gate.accessToken);
  } catch (error) {
    reportError(error, "cap-desk-integrations");
    return <DeskUnavailable what="CAP integrations" />;
  }
  return (
    <div className="space-y-6">
      <h1 className="font-semibold text-2xl">CAP integrations</h1>
      <p className="text-body-sm text-muted-foreground">
        This page is read-only. Configuration and queued jobs are not proof that
        a warning was delivered to anyone. &ldquo;Not configured&rdquo; means
        nothing is set up for that channel yet.
      </p>
      {INTEGRATION_GROUPS.map((group) => {
        const records = groupRecords(response, group.key);
        return (
          <section className="space-y-3" key={group.key}>
            <h2 className="font-semibold text-lg">
              {group.title}{" "}
              <span className="font-normal text-muted-foreground">
                ({records.length})
              </span>
            </h2>
            {records.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">
                {group.empty}
              </p>
            ) : (
              records.map((record, index) => (
                <IntegrationCard
                  fields={group.fields}
                  key={recordKey(record, group.key, index)}
                  record={record}
                />
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}

function IntegrationCard({
  fields,
  record,
}: {
  fields: readonly string[];
  record: IntegrationRecord;
}) {
  return (
    <dl className="grid gap-2 rounded-lg border bg-card p-4 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field}>
          <dt className="text-body-sm text-muted-foreground">
            {field.replaceAll("_", " ")}
          </dt>
          <dd className="break-words">
            {field === "created_at"
              ? grenadaTime(String(record[field] ?? ""))
              : fieldValue(record, field)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function recordKey(record: IntegrationRecord, group: string, index: number) {
  const id = record.id;
  return typeof id === "string" ? id : `${group}-${index}`;
}
