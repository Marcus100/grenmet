import { CapAdminUnavailable } from "@/components/cap/admin-status";
import { NewAlertEditor } from "@/components/cap/alert-editor";
import { loadCapCatalogs } from "@/db/cap/queries";

export default async function NewAlertPage() {
  let catalogs: Awaited<ReturnType<typeof loadCapCatalogs>>;
  try {
    catalogs = await loadCapCatalogs();
  } catch {
    return <CapAdminUnavailable />;
  }
  return <NewAlertEditor catalogs={catalogs} />;
}
