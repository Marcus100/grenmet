import type {
  AuthConfig,
  SessionAccessTokenResponse,
  SessionLoginResponse,
} from "../types";
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

export async function createSession(
  config: AuthConfig,
  input: {
    email: string;
    password: string;
    appName?: string | null;
    clientType?: string;
  }
): Promise<SessionLoginResponse> {
  return authApiFetch<SessionLoginResponse>(config, "/login/session", {
    body: {
      email: input.email,
      password: input.password,
      client_type: input.clientType ?? "web",
      app_name: input.appName ?? null,
    },
    method: "POST",
  });
}

export async function refreshSession(
  config: AuthConfig,
  sessionToken: string
): Promise<SessionLoginResponse> {
  return authApiFetch<SessionLoginResponse>(config, "/login/session/refresh", {
    body: { session_token: sessionToken },
    method: "POST",
  });
}
