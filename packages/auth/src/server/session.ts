import type { AuthConfig, SessionAccessTokenResponse } from "../types";
import { authApiFetch } from "./auth-api-fetch";

export async function exchangeSessionForAccessToken(
  config: AuthConfig,
  sessionToken: string
): Promise<SessionAccessTokenResponse> {
  return authApiFetch<SessionAccessTokenResponse>(
    config,
    "/login/session/access-token",
    {
      body: { session_token: sessionToken },
      method: "POST",
    }
  );
}

export async function logoutSession(
  config: AuthConfig,
  sessionToken: string
): Promise<void> {
  await authApiFetch<{ message: string }>(config, "/login/session/logout", {
    body: { session_token: sessionToken },
    method: "POST",
  });
}

export async function logoutAllSessions(
  config: AuthConfig,
  sessionToken: string
): Promise<void> {
  await authApiFetch<{ message: string }>(config, "/login/session/logout-all", {
    body: { session_token: sessionToken },
    method: "POST",
  });
}
