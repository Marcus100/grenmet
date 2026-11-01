import type { CapAlertPublic, CapLifecycleState } from "@barrelsgd/api-client";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertBoardFilter } from "@/components/desk/alert-board-filter";
import { DeskRefused, DeskUnavailable } from "@/components/desk/desk-panels";
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
      <AlertBoardFilter
        sections={SECTIONS.map((section, index) => ({
          ...section,
          alerts: lists[index] ?? [],
        }))}
      />
    </div>
  );
}
