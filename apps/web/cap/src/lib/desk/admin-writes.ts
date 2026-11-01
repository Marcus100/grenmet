import "server-only";

import {
  type CapFeedImportCreate,
  type CapFeedImportUpdate,
  type CapPredefinedAreaCreate,
  type CapSettingsUpdate,
  capFeedImportPublicSchema,
  capPredefinedAreaPublicSchema,
  capSettingsPublicSchema,
} from "@barrelsgd/api-client";
import { authApiFetch, authApiFetchResponse } from "@barrelsgd/auth/server";
import { getAuthConfig } from "./auth-config";

/**
 * FastAPI writes for the desk's admin screens, called only from server actions
 * (`runDeskAction`). Browser code never builds these URLs, so the desk proxy's
 * allow-list does not grow for them. Paths use constant templates and
 * validated ids only.
 */
export function patchCapSettings(accessToken: string, body: CapSettingsUpdate) {
  return authApiFetch(
    getAuthConfig(),
    "/cap/settings",
    capSettingsPublicSchema,
    {
      accessToken,
      body,
      cache: "no-store",
      method: "PATCH",
    }
  );
}

export function createCapFeed(accessToken: string, body: CapFeedImportCreate) {
  return authApiFetch(
    getAuthConfig(),
    "/cap/feeds",
    capFeedImportPublicSchema,
    {
      accessToken,
      body,
      cache: "no-store",
      method: "POST",
    }
  );
}

export function updateCapFeed(
  accessToken: string,
  feedId: string,
  body: CapFeedImportUpdate
) {
  return authApiFetch(
    getAuthConfig(),
    `/cap/feeds/${encodeURIComponent(feedId)}`,
    capFeedImportPublicSchema,
    { accessToken, body, cache: "no-store", method: "PATCH" }
  );
}

/** FastAPI answers 204 with no body, so only the status is checked. */
export async function deleteCapFeed(accessToken: string, feedId: string) {
  await authApiFetchResponse(
    getAuthConfig(),
    `/cap/feeds/${encodeURIComponent(feedId)}`,
    { accessToken, cache: "no-store", method: "DELETE" }
  );
}

/** A saved area is reusable in every later alert. Needs cap.settings.manage. */
export function createPredefinedArea(
  accessToken: string,
  body: CapPredefinedAreaCreate
) {
  return authApiFetch(
    getAuthConfig(),
    "/cap/areas/predefined",
    capPredefinedAreaPublicSchema,
    { accessToken, body, cache: "no-store", method: "POST" }
  );
}
