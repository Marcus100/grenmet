import type { AuthConfig } from "@barrelsgd/auth";
import { getEnv } from "../env";
export function getAuthConfig(): AuthConfig {
  const env = getEnv();
  return {
    appName: "gms-cms",
    authApiBaseUrl: env.AUTH_API_URL,
    authApiPrefix: "/api/v1",
    authAppUrl: env.AUTH_APP_URL,
    sessionCookieName: env.SESSION_COOKIE_NAME,
    sessionCookieDomain: env.SESSION_COOKIE_DOMAIN,
  };
}
