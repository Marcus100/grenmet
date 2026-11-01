import type { Metadata } from "next";
import { DeskRefused, DeskUnavailable } from "@/components/desk/desk-panels";
import { GmsCatalogueProvider } from "@/components/desk/gms-catalogue";
import { PredefinedAreaManager } from "@/components/desk/predefined-area-manager";
import { getGmsCatalogue, listPredefinedAreas } from "@/lib/desk/api";
import { requireDeskGate } from "@/lib/desk/gate";
import { reportError } from "@/lib/report-error";

export const metadata: Metadata = { title: "Predefined areas" };
export const dynamic = "force-dynamic";

/**
 * Saved areas are read by every staff member. Saving one needs
 * cap.settings.manage, shown as its own no-access state rather than hiding
 * the list or the form silently.
 */
export default async function AreasPage() {
  const gate = await requireDeskGate("/desk/areas");
  if (gate.status === "refused") return <DeskRefused email={gate.email} />;
  let areas: Awaited<ReturnType<typeof listPredefinedAreas>>;
  let catalogue: Awaited<ReturnType<typeof getGmsCatalogue>>;
  try {
    [areas, catalogue] = await Promise.all([
      listPredefinedAreas(gate.accessToken),
      getGmsCatalogue(gate.accessToken),
    ]);
  } catch (error) {
    reportError(error, "cap-desk-areas");
    return <DeskUnavailable what="Predefined areas" />;
  }
  return (
    <GmsCatalogueProvider catalogue={catalogue}>
      <div className="space-y-6">
        <h1 className="font-semibold text-2xl">Predefined CAP areas</h1>
        <p className="text-body-sm text-muted-foreground">
          Reusable geographic areas for future warnings. Existing areas cannot
          be edited or removed yet.
        </p>
        <PredefinedAreaManager
          areas={areas}
          canCreate={gate.permissions.settingsManage}
        />
      </div>
    </GmsCatalogueProvider>
  );
}
