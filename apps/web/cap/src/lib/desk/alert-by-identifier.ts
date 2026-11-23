import "server-only";

import {
  capAlertPublicSchema,
  capGetAlertByIdentifier,
} from "@barrelsgd/api-client";
import { getAuthConfig } from "./auth-config";

export async function getAlertByIdentifier(
  accessToken: string,
  identifier: string
) {
  const alert = await capGetAlertByIdentifier({
    auth: accessToken,
    baseURL: getAuthConfig().authApiBaseUrl,
    options: { cache: "no-store" },
    path: { identifier },
  }).unwrap();
  return capAlertPublicSchema.parse(alert);
}
