import "server-only";
import {
  capAuditEventListPublicSchema,
  capCatalogsPublicSchema,
  capGetFeedsResponseSchema,
  capGetIntegrationsResponseSchema,
  capGetPredefinedAreasResponseSchema,
  capSettingsPublicSchema,
} from "@barrelsgd/api-client";
import {
  authApiFetch,
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@/lib/server-session";

async function accessToken() {
  const session = await readSessionCookie();
  if (!session) throw new Error("Sign in to use CAP administration.");
  return (await exchangeSessionForAccessToken(session)).access_token;
}

export async function loadCapCatalogs() {
  return authApiFetch("/cap/catalogs", capCatalogsPublicSchema, {
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
