import "server-only";
import {
  capAlertPublicSchema,
  capAuditEventListPublicSchema,
  capCatalogsPublicSchema,
  capGetFeedsResponseSchema,
  capGetIntegrationsResponseSchema,
  capGetPredefinedAreasResponseSchema,
  capSettingsPublicSchema,
  gmsCataloguePublicSchema,
} from "@barrelsgd/api-client";
import { notFound } from "next/navigation";
import {
  authApiFetch,
  exchangeSessionForAccessToken,
  isAuthApiError,
  readSessionCookie,
} from "@/lib/server-session";

async function accessToken() {
  const session = await readSessionCookie();
  if (!session) throw new Error("Sign in to use CAP administration.");
  return (await exchangeSessionForAccessToken(session)).access_token;
}

/**
 * One alert by identifier, staff view (every field, including the schema flag and
 * the imported marker). A missing alert is a 404 page; any other failure is thrown.
 */
export async function loadCapAlertByIdentifier(identifier: string) {
  try {
    return await authApiFetch(
      `/cap/alerts/by-identifier/${encodeURIComponent(identifier)}`,
      capAlertPublicSchema,
      { accessToken: await accessToken(), cache: "no-store" }
    );
  } catch (error) {
    if (isAuthApiError(error) && error.status === 404) {
      notFound();
    }
    throw error;
  }
}

export async function loadCapCatalogs() {
  return authApiFetch("/cap/catalogs", capCatalogsPublicSchema, {
    accessToken: await accessToken(),
    cache: "no-store",
  });
}

/** The GMS hazard list, parish geocodes and product and colour rules (cap.alert.read). */
export async function loadGmsCatalogue() {
  return authApiFetch("/cap/gms-catalogue", gmsCataloguePublicSchema, {
    accessToken: await accessToken(),
    cache: "no-store",
  });
}

export async function loadCapSettings() {
  return authApiFetch("/cap/settings", capSettingsPublicSchema, {
    accessToken: await accessToken(),
    cache: "no-store",
  });
}
export async function loadCapFeeds() {
  return authApiFetch("/cap/feeds", capGetFeedsResponseSchema, {
    accessToken: await accessToken(),
    cache: "no-store",
  });
}
export async function loadCapAreas() {
  return authApiFetch(
    "/cap/areas/predefined",
    capGetPredefinedAreasResponseSchema,
    {
      accessToken: await accessToken(),
      cache: "no-store",
    }
  );
}
export async function loadCapIntegrations() {
  return authApiFetch("/cap/integrations", capGetIntegrationsResponseSchema, {
    accessToken: await accessToken(),
    cache: "no-store",
  });
}
export async function loadCapAudit(page: number, alertId?: string) {
  const query = new URLSearchParams({ page: String(page), size: "25" });
  if (alertId) query.set("alert_id", alertId);
  return authApiFetch(`/cap/audit?${query}`, capAuditEventListPublicSchema, {
    accessToken: await accessToken(),
    cache: "no-store",
  });
}
