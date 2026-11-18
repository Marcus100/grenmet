import { listPrintixAccess } from "@/lib/api";
import { printixNoticeFor } from "@/lib/printix-form";
import { PrintixAccessPanel } from "./printix-access";

/** Loads the Printix roster and renders the panel. Renders nothing unless the
 * organisation has Printix turned on. */
export async function PrintixAccessSection({
  accessToken,
  apps,
  noticeCode,
  organisationId,
}: {
  accessToken: string;
  apps: { app_key: string; enabled: boolean }[];
  noticeCode: string | undefined;
  organisationId: string;
}) {
  if (!apps.some((app) => app.app_key === "printix" && app.enabled)) {
    return null;
  }
  const access = await listPrintixAccess(accessToken, organisationId);
  return (
    <PrintixAccessPanel
      count={access.count}
      notice={printixNoticeFor(noticeCode)}
      organisationId={organisationId}
      rows={access.data}
    />
  );
}
