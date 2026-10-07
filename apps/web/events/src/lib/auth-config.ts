import type { AuthConfig } from "@barrelsgd/auth";
import { env } from "@/env";

/**
 * App-scoped sign-in (ADR-0016): own host-only cookie, no shared domain.
 * Single sign-on from auth.barrels.gd (ADR-0017) uses authAppUrl.
 */
export const authConfig: AuthConfig = {
  appName: "events",
  authApiBaseUrl: env.AUTH_API_URL,
  authApiPrefix: env.AUTH_API_V1_STR,
  authAppUrl: env.AUTH_APP_URL,
  sessionCookieName: env.EVENTS_SESSION_COOKIE_NAME,
};

/** Path prefix of this app's sign-in routes on the auth API. */
export const APP_AUTH_PATH = "/auth/apps/events";
