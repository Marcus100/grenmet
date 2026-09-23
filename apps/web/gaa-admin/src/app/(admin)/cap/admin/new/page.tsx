import { CapAdminUnavailable } from "@/components/cap/admin-status";
import { NewAlertEditor } from "@/components/cap/alert-editor";
import { loadCapCatalogs } from "@/db/cap/queries";
import { reportError } from "@/lib/report-error";

export default async function NewAlertPage() {
  let catalogs: Awaited<ReturnType<typeof loadCapCatalogs>>;
  try {
    catalogs = await loadCapCatalogs();
  } catch (error) {
    reportError(error, "cap-admin");
    return <CapAdminUnavailable />;
  }
  return <NewAlertEditor catalogs={catalogs} />;
}
