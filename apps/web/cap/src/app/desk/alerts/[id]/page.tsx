import { isAuthApiError } from "@barrelsgd/auth";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertActions } from "@/components/desk/alert-actions";
import {
  AlertBadges,
  DeskRefused,
  DeskUnavailable,
  FormatProblemBanner,
  formatProblems,
  SavedAlert,
} from "@/components/desk/desk-panels";
import { DuplicateAlertButton } from "@/components/desk/duplicate-alert-button";
import { getAlert, getAlertAudit } from "@/lib/desk/api";
import { requireDeskGate } from "@/lib/desk/gate";
import { reportError } from "@/lib/report-error";

export const metadata: Metadata = { title: "Alert" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function DeskAlertPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const gate = await requireDeskGate(`/desk/alerts/${id}`);
  if (gate.status === "refused") return <DeskRefused email={gate.email} />;

  let alert: Awaited<ReturnType<typeof getAlert>>;
  try {
    alert = await getAlert(gate.accessToken, id);
  } catch (error) {
    if (isAuthApiError(error) && error.status === 404) notFound();
    reportError(error, "cap-desk-alert");
    return <DeskUnavailable what="This alert" />;
  }
  // The trail only adds the format-problem notice; the page works without it.
  const audit = await getAlertAudit(gate.accessToken, id).catch((error) => {
    reportError(error, "cap-desk-audit");
    return null;
  });

  return (
    <div className="space-y-6">
      <Link className="text-body-sm text-info underline" href="/desk">
        Back to the board
      </Link>
      <div className="space-y-2">
        <h1 className="font-semibold text-2xl">
          {alert.info?.[0]?.headline ?? alert.identifier}
        </h1>
        <AlertBadges alert={alert} />
      </div>
      <FormatProblemBanner problems={formatProblems(audit?.data ?? [])} />
      {audit === null ? (
        <p className="text-body-sm text-muted-foreground" role="status">
          The audit history could not be loaded, so a format problem from an
          emergency publish or cancellation would not show here.
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <SavedAlert alert={alert} />
        <div className="space-y-6">
          <AlertActions
            alert={alert}
            permissions={gate.permissions}
            userId={gate.userId}
          />
          <DuplicateAlertButton
            alertId={alert.id}
            canCreate={gate.permissions.create}
          />
        </div>
      </div>
    </div>
  );
}
