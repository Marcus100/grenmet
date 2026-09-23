import {
  CapAdminHeading,
  CapAdminUnavailable,
} from "@/components/cap/admin-status";
import { PredefinedAreaManager } from "@/components/cap/predefined-area-manager";
import { loadCapAreas } from "@/db/cap/queries";

export default async function AreasPage() {
  let areas: Awaited<ReturnType<typeof loadCapAreas>>;
  try {
    areas = await loadCapAreas();
  } catch {
    return <CapAdminUnavailable />;
  }
  return (
    <CapAdminHeading title="Predefined CAP areas">
      <PredefinedAreaManager areas={areas} />
    </CapAdminHeading>
  );
}
