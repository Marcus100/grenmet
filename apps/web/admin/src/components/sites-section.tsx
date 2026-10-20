import { SitesError, SitesPanel } from "@/components/site-panels";
import { listOrganisationSites } from "@/lib/api";
import { reportError } from "@/lib/report-error";

/**
 * Streams in behind Suspense so a slow or failing sites call never blocks the
 * rest of the organisation page.
 */
export async function SitesSection({
  accessToken,
  organisationId,
}: {
  accessToken: string;
  organisationId: string;
}) {
  try {
    const { data } = await listOrganisationSites(accessToken, organisationId);
    return <SitesPanel organisationId={organisationId} sites={data} />;
  } catch (error) {
    reportError(error, "admin-sites");
    return <SitesError />;
  }
}
