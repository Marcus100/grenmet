import {
  CapAdminHeading,
  CapAdminUnavailable,
} from "@/components/cap/admin-status";
import { PredefinedAreaManager } from "@/components/cap/predefined-area-manager";
import { loadCapAreas } from "@/db/cap/queries";
import { reportError } from "@/lib/report-error";

export default async function AreasPage() {
  let areas: Awaited<ReturnType<typeof loadCapAreas>>;
  try {
    areas = await loadCapAreas();
  } catch (error) {
    reportError(error, "cap-admin");
    return <CapAdminUnavailable />;
  }
  return (
    <CapAdminHeading title="Predefined CAP areas">
      <PredefinedAreaManager areas={areas} />
    </CapAdminHeading>
  );
}
