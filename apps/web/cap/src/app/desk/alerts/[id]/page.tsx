import { isAuthApiError } from "@barrelsgd/auth";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertActions } from "@/components/desk/alert-actions";
import { AlertAuditTrail } from "@/components/desk/alert-audit-trail";
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
import { capXmlPath } from "@/lib/desk/cap/cap-xml-link";
import { requireDeskGate } from "@/lib/desk/gate";
import { reportError } from "@/lib/report-error";

export const metadata: Metadata = { title: "Alert" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

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
  // One audit read feeds two things: the history panel and the format-problem
  // notice. If it fails, the page still loads: the history shows as
  // unavailable and the notice is left out.
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
        <h1 className="text-2xl font-semibold">
          {alert.info?.[0]?.headline ?? alert.identifier}
        </h1>
        <AlertBadges alert={alert} />
        {alert.xml_url ? (
          <p className="text-body-sm">
            <a
              className="text-info underline"
              href={capXmlPath(alert.identifier)}
            >
              CAP XML for this alert
            </a>
          </p>
        ) : null}
      </div>
      <FormatProblemBanner problems={formatProblems(audit?.data ?? [])} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <SavedAlert alert={alert} />
          <AlertAuditTrail
            alertId={alert.id}
            events={audit ? audit.data : null}
            total={audit ? audit.count : 0}
          />
        </div>
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
