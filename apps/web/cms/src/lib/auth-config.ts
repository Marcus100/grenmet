import type { AuthConfig } from "@barrelsgd/auth";
import { getEnv } from "../env";
export function getAuthConfig(): AuthConfig {
  const env = getEnv();
  return {
    // Registry key in apps/api/fastapi/src/auth/apps.py (ADR-0017).
    appName: "cms",
    authApiBaseUrl: env.AUTH_API_URL,
    authApiPrefix: "/api/v1",
    authAppUrl: env.AUTH_APP_URL,
    sessionCookieName: env.CMS_SESSION_COOKIE_NAME,
  };
}
