import "server-only";

import {
  type CapLifecycleState,
  capAlertListPublicSchema,
  capAlertPublicSchema,
  capAuditEventListPublicSchema,
  capCatalogsPublicSchema,
  capFeedImportPublicSchema,
  capGetIntegrationsResponseSchema,
  capSettingsPublicSchema,
  gmsCataloguePublicSchema,
} from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { z } from "zod";
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

/** The global audit trail, newest first, optionally for one alert. */
export function listAuditEvents(
  accessToken: string,
  {
    alertId,
    page,
    size,
  }: { alertId: string | null; page: number; size: number }
) {
  const query = new URLSearchParams({ page: String(page), size: String(size) });
  if (alertId) query.set("alert_id", alertId);
  return read(
    accessToken,
    `/cap/audit?${query}`,
    capAuditEventListPublicSchema
  );
}

/** Configured external CAP feed sources. */
export function listFeeds(accessToken: string) {
  return read(accessToken, "/cap/feeds", z.array(capFeedImportPublicSchema));
}

/** Channel configuration and recent job events. Read-only; never a delivery claim. */
export function getIntegrations(accessToken: string) {
  return read(
    accessToken,
    "/cap/integrations",
    capGetIntegrationsResponseSchema
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
