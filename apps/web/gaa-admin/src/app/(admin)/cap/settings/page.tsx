import {
  CapAdminHeading,
  CapAdminUnavailable,
} from "@/components/cap/admin-status";
import { CapSettingsEditor } from "@/components/cap/settings-editor";
import { loadCapSettings } from "@/db/cap/queries";

export default async function SettingsPage() {
  let settings: Awaited<ReturnType<typeof loadCapSettings>>;
  try {
    settings = await loadCapSettings();
  } catch {
    return <CapAdminUnavailable />;
  }
  return (
    <CapAdminHeading title="CAP settings">
      <CapSettingsEditor initial={settings} key={settings.updated_at} />
    </CapAdminHeading>
  );
}
