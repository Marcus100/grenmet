import type { AuthConfig } from "@barrelsgd/auth";
import { env } from "@/lib/env";

/** Sign in with the Barrels account (ADR-0017); registry key "weather". */
export const authConfig: AuthConfig = {
  appName: "weather",
  authApiBaseUrl: env.AUTH_API_URL,
  authApiPrefix: env.AUTH_API_V1_STR,
  authAppUrl: env.AUTH_APP_URL,
  sessionCookieName: env.WEATHER_SESSION_COOKIE_NAME,
};

export const APP_LABEL = "Grenada Meteorological Service";

export function signInEnabled(): boolean {
  return Boolean(env.WEATHER_SSO_CLIENT_SECRET);
}
