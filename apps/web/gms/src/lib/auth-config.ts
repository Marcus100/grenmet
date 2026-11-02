import "server-only";
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

/**
 * Whether the "Sign in" button is shown (WEATHER_SHOW_SIGN_IN, off by default).
 * It only hides the button: the auth routes and account handling still run.
 */
export function signInVisible(): boolean {
  return env.WEATHER_SHOW_SIGN_IN;
}
