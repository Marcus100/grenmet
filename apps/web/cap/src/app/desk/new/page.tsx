import type { Metadata } from "next";
import { AlertEditor } from "@/components/desk/alert-editor";
import { DeskRefused, DeskUnavailable } from "@/components/desk/desk-panels";
import { GmsCatalogueProvider } from "@/components/desk/gms-catalogue";
import { getCatalogs, getGmsCatalogue, getSettings } from "@/lib/desk/api";
import { requireDeskGate } from "@/lib/desk/gate";
import { reportError } from "@/lib/report-error";

export const metadata: Metadata = { title: "New warning" };
export const dynamic = "force-dynamic";

export default async function NewWarningPage() {
  const gate = await requireDeskGate("/desk/new");
  if (gate.status === "refused") return <DeskRefused email={gate.email} />;
  if (!gate.permissions.create) {
    return <DeskRefused email={gate.email} />;
  }
  let loaded: [
    Awaited<ReturnType<typeof getCatalogs>>,
    Awaited<ReturnType<typeof getGmsCatalogue>>,
  ];
  try {
    loaded = await Promise.all([
      getCatalogs(gate.accessToken),
      getGmsCatalogue(gate.accessToken),
    ]);
  } catch (error) {
    reportError(error, "cap-desk-editor");
    return <DeskUnavailable what="The warning rules" />;
  }
  // Sender details are a convenience; the editor works without them.
  const settings = await getSettings(gate.accessToken).catch((error) => {
    reportError(error, "cap-desk-settings");
    return null;
  });
  const [catalogs, catalogue] = loaded;
  return (
    <GmsCatalogueProvider catalogue={catalogue}>
      <AlertEditor catalogs={catalogs} mode="create" settings={settings} />
    </GmsCatalogueProvider>
  );
}
