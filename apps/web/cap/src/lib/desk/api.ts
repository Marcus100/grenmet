import "server-only";

import {
  type CapLifecycleState,
  capAlertListPublicSchema,
  capAlertPublicSchema,
  capAuditEventListPublicSchema,
  capCatalogsPublicSchema,
  capGetHazardProfilesResponseSchema,
  capGetIbfMatrixResponseSchema,
  capSettingsPublicSchema,
  capSuggestIbfResponseSchema,
  gmsCataloguePublicSchema,
} from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { getAuthConfig } from "./auth-config";

/**
 * Server-side reads for the warning desk with the signed-in forecaster's
 * staff token. Never cached: a warning desk must show what is true now.
 */
function read<T>(
  accessToken: string,
  path: string,
  parser: { parse: (value: unknown) => T }
): Promise<T> {
  return authApiFetch(getAuthConfig(), path, parser, {
    accessToken,
    cache: "no-store",
  });
}

export const BOARD_PAGE_SIZE = 50;

export function listAlerts(
  accessToken: string,
  lifecycleState?: CapLifecycleState
) {
  const query = new URLSearchParams({
    page: "1",
    size: String(BOARD_PAGE_SIZE),
  });
  if (lifecycleState) query.set("lifecycle_state", lifecycleState);
  return read(accessToken, `/cap/alerts?${query}`, capAlertListPublicSchema);
}

export function getAlert(accessToken: string, alertId: string) {
  return read(
    accessToken,
    `/cap/alerts/${encodeURIComponent(alertId)}`,
    capAlertPublicSchema
  );
}

/** Newest first; the desk reads it for schema-mismatch notices and the trail. */
export function getAlertAudit(accessToken: string, alertId: string) {
  const query = new URLSearchParams({
    page: "1",
    size: "50",
    alert_id: alertId,
  });
  return read(
    accessToken,
    `/cap/audit?${query}`,
    capAuditEventListPublicSchema
  );
}

export function getGmsCatalogue(accessToken: string) {
  return read(accessToken, "/cap/gms-catalogue", gmsCataloguePublicSchema);
}

export function getCatalogs(accessToken: string) {
  return read(accessToken, "/cap/catalogs", capCatalogsPublicSchema);
}

/** Every saved hazard profile version; used here for the hazard picker. */
export function listHazardProfiles(accessToken: string) {
  return read(
    accessToken,
    "/cap/hazard-profiles",
    capGetHazardProfilesResponseSchema
  );
}

/** The impact matrix a hazard kind uses: its own approved grid, or WMO's. */
export function getIbfMatrix(accessToken: string, kind: string) {
  const query = new URLSearchParams({ kind });
  return read(
    accessToken,
    `/cap/ibf/matrix?${query}`,
    capGetIbfMatrixResponseSchema
  );
}

/** Advice only: the colour and starting wording for one likelihood and impact. */
export function suggestIbf(
  accessToken: string,
  params: { impact: string; kind: string; likelihood: string; subtype?: string }
) {
  const query = new URLSearchParams({
    impact: params.impact,
    kind: params.kind,
    likelihood: params.likelihood,
  });
  if (params.subtype) query.set("subtype", params.subtype);
  return read(
    accessToken,
    `/cap/ibf/suggest?${query}`,
    capSuggestIbfResponseSchema
  );
}

export function getSettings(accessToken: string) {
  return read(accessToken, "/cap/settings", capSettingsPublicSchema);
}
