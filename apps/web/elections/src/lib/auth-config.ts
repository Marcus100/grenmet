import type { AuthConfig } from "@barrelsgd/auth";
import { env } from "@/lib/env";

/** Sign in with the Barrels account (ADR-0017); registry key "elections". */
export const authConfig: AuthConfig = {
  appName: "elections",
  authApiBaseUrl: env.AUTH_API_URL,
  authApiPrefix: env.AUTH_API_V1_STR,
  authAppUrl: env.AUTH_APP_URL,
  sessionCookieName: env.ELECTIONS_SESSION_COOKIE_NAME,
};

export const APP_LABEL = "Elections Grenada";

export function signInEnabled(): boolean {
  return Boolean(env.ELECTIONS_SSO_CLIENT_SECRET);
}
