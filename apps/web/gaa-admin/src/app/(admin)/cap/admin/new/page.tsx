import { CapAdminUnavailable } from "@/components/cap/admin-status";
import { NewAlertEditor } from "@/components/cap/alert-editor";
import { loadCapCatalogs, loadCapSettings } from "@/db/cap/queries";
import { reportError } from "@/lib/report-error";

export default async function NewAlertPage() {
  let catalogs: Awaited<ReturnType<typeof loadCapCatalogs>>;
  try {
    catalogs = await loadCapCatalogs();
  } catch (error) {
    reportError(error, "cap-admin");
    return <CapAdminUnavailable />;
  }
  // Sender details are a convenience: the composer still works without them.
  let settings: Awaited<ReturnType<typeof loadCapSettings>> | null = null;
  try {
    settings = await loadCapSettings();
  } catch (error) {
    reportError(error, "cap-admin-settings");
  }
  return <NewAlertEditor catalogs={catalogs} settings={settings} />;
}
