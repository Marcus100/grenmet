import {
  CapAdminHeading,
  CapAdminUnavailable,
} from "@/components/cap/admin-status";
import { CapSettingsEditor } from "@/components/cap/settings-editor";
import { loadCapSettings } from "@/db/cap/queries";
import { reportError } from "@/lib/report-error";

export default async function SettingsPage() {
  let settings: Awaited<ReturnType<typeof loadCapSettings>>;
  try {
    settings = await loadCapSettings();
  } catch (error) {
    reportError(error, "cap-admin");
    return <CapAdminUnavailable />;
  }
  return (
    <CapAdminHeading title="CAP settings">
      <CapSettingsEditor initial={settings} key={settings.updated_at} />
    </CapAdminHeading>
  );
}
