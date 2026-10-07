import type { AuthConfig } from "@barrelsgd/auth";
import { env } from "@/lib/env";

/** Sign in with the Barrels account (ADR-0017); registry key "mbia". */
export const authConfig: AuthConfig = {
  appName: "mbia",
  authApiBaseUrl: env.AUTH_API_URL,
  authApiPrefix: env.AUTH_API_V1_STR,
  authAppUrl: env.AUTH_APP_URL,
  sessionCookieName: env.MBIA_SESSION_COOKIE_NAME,
};

export const APP_LABEL = "Grenada Airports Authority";

export function signInEnabled(): boolean {
  return Boolean(env.MBIA_SSO_CLIENT_SECRET);
}
