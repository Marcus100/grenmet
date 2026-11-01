import type { CapAlertPublic, CapLifecycleState } from "@barrelsgd/api-client";
import type { Metadata, Route } from "next";
import Link from "next/link";
import {
  AlertBadges,
  DeskRefused,
  DeskUnavailable,
  grenadaTime,
} from "@/components/desk/desk-panels";
import { listAlerts } from "@/lib/desk/api";
import { requireDeskGate } from "@/lib/desk/gate";
import { reportError } from "@/lib/report-error";

export const metadata: Metadata = { title: "Board" };
export const dynamic = "force-dynamic";

const SECTIONS: { empty: string; state: CapLifecycleState; title: string }[] = [
  { state: "DRAFT", title: "Drafts", empty: "No drafts." },
  {
    state: "SUBMITTED",
    title: "Awaiting approval",
    empty: "Nothing is waiting for approval.",
  },
  {
    state: "APPROVED",
    title: "Approved, not yet published",
    empty: "Nothing approved and waiting.",
  },
  {
    state: "PUBLISHED",
    title: "In force",
    empty: "No published alerts are in force.",
  },
];

function AlertRow({ alert }: { alert: CapAlertPublic }) {
  const info = alert.info?.[0];
  return (
    <li className="flex flex-col gap-1 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link
          className="font-medium text-info hover:underline"
          href={`/desk/alerts/${alert.id}` as Route}
        >
          {info?.headline ?? alert.identifier}
        </Link>
        <p className="text-caption text-muted-foreground">
          {info?.event ?? "No event"} · Severity {info?.severity ?? "Unknown"} ·
          Expires {grenadaTime(info?.expires)}
        </p>
      </div>
      <AlertBadges alert={alert} />
    </li>
  );
}

/** Every open and in-force warning, by stage. Empty stages still show (no auto-hiding). */
export default async function DeskBoard() {
  const gate = await requireDeskGate("/desk");
  if (gate.status === "refused") return <DeskRefused email={gate.email} />;
  let lists: CapAlertPublic[][];
  try {
    lists = await Promise.all(
      SECTIONS.map(
        async (section) =>
          (await listAlerts(gate.accessToken, section.state)).data
      )
    );
  } catch (error) {
    reportError(error, "cap-desk-board");
    return <DeskUnavailable what="The warning board" />;
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-2xl">Warning board</h1>
        {gate.permissions.create ? (
          <Link
            className="rounded-md bg-primary px-3 py-2 font-medium text-body-sm text-primary-foreground"
            href="/desk/new"
          >
            New warning
          </Link>
        ) : null}
      </div>
      <p className="text-body-sm text-muted-foreground">
        Raise-to-warning drafts from GMS alerts appear under Drafts. Imported
        partner alerts are marked Imported and need a confirmation to publish.
      </p>
      {SECTIONS.map((section, index) => ({
        ...section,
        alerts: lists[index] ?? [],
      })).map((section) => (
        <section className="rounded-lg border bg-card p-4" key={section.state}>
          <h2 className="font-semibold text-lg">
            {section.title}{" "}
            <span className="font-normal text-muted-foreground">
              ({section.alerts.length})
            </span>
          </h2>
          {section.alerts.length === 0 ? (
            <p className="py-2 text-body-sm text-muted-foreground">
              {section.empty}
            </p>
          ) : (
            <ul>
              {section.alerts.map((alert) => (
                <AlertRow alert={alert} key={alert.id} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
