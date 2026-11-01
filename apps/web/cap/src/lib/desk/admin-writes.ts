import "server-only";

import {
  type CapSettingsUpdate,
  capSettingsPublicSchema,
} from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
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
