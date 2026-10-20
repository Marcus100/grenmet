import { ApiKeysError, ApiKeysPanel } from "@/components/api-key-panels";
import { listOrganisationApiKeys } from "@/lib/api";
import { reportError } from "@/lib/report-error";

/** Streams in behind Suspense, like the Sites section. */
export async function ApiKeysSection({
  accessToken,
  organisationId,
}: {
  accessToken: string;
  organisationId: string;
}) {
  try {
    const list = await listOrganisationApiKeys(accessToken, organisationId);
    return (
      <ApiKeysPanel
        count={list.count}
        now={new Date()}
        organisationId={organisationId}
        rows={list.data}
      />
    );
  } catch (error) {
    reportError(error, "admin-api-keys");
    return <ApiKeysError />;
  }
}
