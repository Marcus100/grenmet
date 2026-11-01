import "server-only";

import {
  type CapAlertImportRequest,
  type CapLifecycleState,
  capAlertListPublicSchema,
  capAlertPublicSchema,
  capAuditEventListPublicSchema,
  capCatalogsPublicSchema,
  capGetHazardProfilesResponseSchema,
  capProfilePublicSchema,
  capSettingsPublicSchema,
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

/** A staff write with the forecaster's token. Never cached. */
function write<T>(
  accessToken: string,
  path: string,
  body: unknown,
  parser: { parse: (value: unknown) => T }
): Promise<T> {
  return authApiFetch(getAuthConfig(), path, parser, {
    accessToken,
    body,
    cache: "no-store",
    method: "POST",
  });
}

/**
 * Imports one CAP document from pasted XML or a public https address. The
 * API keeps the alert as a draft flagged as imported; it never publishes it.
 */
export function importAlert(accessToken: string, body: CapAlertImportRequest) {
  return write(accessToken, "/cap/alerts/import", body, capAlertPublicSchema);
}

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

export function getSettings(accessToken: string) {
  return read(accessToken, "/cap/settings", capSettingsPublicSchema);
}

/** Every saved version of every hazard profile, newest first per key. */
export function listHazardProfiles(accessToken: string) {
  return read(
    accessToken,
    "/cap/hazard-profiles",
    capGetHazardProfilesResponseSchema
  );
}

/**
 * Approves one draft profile version. The API refuses the author's own
 * version (a different reviewer must approve) and any version with
 * `approval_errors`; the desk shows those refusals as they come back.
 */
export function approveHazardProfile(accessToken: string, profileId: string) {
  return write(
    accessToken,
    `/cap/hazard-profiles/${encodeURIComponent(profileId)}/approve`,
    undefined,
    capProfilePublicSchema
  );
}
