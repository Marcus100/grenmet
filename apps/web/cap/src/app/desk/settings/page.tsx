import type { Metadata } from "next";
import {
  DeskForbidden,
  DeskRefused,
  DeskUnavailable,
} from "@/components/desk/desk-panels";
import { SettingsForm } from "@/components/desk/settings-form";
import { getSettings } from "@/lib/desk/api";
import { requireDeskGate } from "@/lib/desk/gate";
import { reportError } from "@/lib/report-error";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/**
 * CAP sender details that every new warning inherits. Reading and changing
 * them needs `cap.settings.manage`, the same key FastAPI enforces.
 */
export default async function SettingsPage() {
  const gate = await requireDeskGate("/desk/settings");
  if (gate.status === "refused") return <DeskRefused email={gate.email} />;
  if (!gate.permissions.settingsManage) {
    return (
      <DeskForbidden permission="cap.settings.manage" what="CAP settings" />
    );
  }
  let settings: Awaited<ReturnType<typeof getSettings>>;
  try {
    settings = await getSettings(gate.accessToken);
  } catch (error) {
    reportError(error, "cap-desk-settings");
    return <DeskUnavailable what="CAP settings" />;
  }
  return (
    <div className="space-y-6">
      <h1 className="font-semibold text-2xl">CAP settings</h1>
      <SettingsForm initial={settings} key={settings.updated_at} />
    </div>
  );
}
