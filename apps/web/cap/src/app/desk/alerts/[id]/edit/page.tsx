import { isAuthApiError } from "@barrelsgd/auth";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertEditor } from "@/components/desk/alert-editor";
import { DeskRefused, DeskUnavailable } from "@/components/desk/desk-panels";
import { GmsCatalogueProvider } from "@/components/desk/gms-catalogue";
import { getAlert, getCatalogs, getGmsCatalogue } from "@/lib/desk/api";
import { requireDeskGate } from "@/lib/desk/gate";
import { reportError } from "@/lib/report-error";

export const metadata: Metadata = { title: "Edit draft" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EDITABLE = new Set(["DRAFT", "SUBMITTED", "APPROVED"]);

export default async function EditDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const gate = await requireDeskGate(`/desk/alerts/${id}/edit`);
  if (gate.status === "refused" || !gate.permissions.edit) {
    return <DeskRefused email={gate.email} />;
  }
  let loaded: [
    Awaited<ReturnType<typeof getAlert>>,
    Awaited<ReturnType<typeof getCatalogs>>,
    Awaited<ReturnType<typeof getGmsCatalogue>>,
  ];
  try {
    loaded = await Promise.all([
      getAlert(gate.accessToken, id),
      getCatalogs(gate.accessToken),
      getGmsCatalogue(gate.accessToken),
    ]);
  } catch (error) {
    if (isAuthApiError(error) && error.status === 404) notFound();
    reportError(error, "cap-desk-edit");
    return <DeskUnavailable what="This draft" />;
  }
  const [alert, catalogs, catalogue] = loaded;
  if (!EDITABLE.has(alert.lifecycle_state)) {
    return (
      <section className="space-y-3 py-6" role="alert">
        <h1 className="font-semibold text-2xl">This alert is not a draft</h1>
        <p className="text-muted-foreground">
          It is {alert.lifecycle_state.toLowerCase()} and can no longer be
          edited. To change a published alert, issue an update from its page.
        </p>
        <Link
          className="text-info underline"
          href={`/desk/alerts/${alert.id}` as Route}
        >
          Open the alert
        </Link>
      </section>
    );
  }
  return (
    <GmsCatalogueProvider catalogue={catalogue}>
      <AlertEditor alert={alert} catalogs={catalogs} mode="edit" />
    </GmsCatalogueProvider>
  );
}
