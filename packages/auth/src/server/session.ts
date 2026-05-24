import type {
  AuthConfig,
  MessageResponse,
  SessionAccessTokenResponse,
  SessionLoginResponse,
  Token,
  UserPublic,
} from "../types";
import { authApiFetch, authApiFormFetch } from "./auth-api-fetch";

export function exchangeSessionForAccessToken(
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

export function createSession(
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

export function refreshSession(
  config: AuthConfig,
  sessionToken: string
): Promise<SessionLoginResponse> {
  return authApiFetch<SessionLoginResponse>(config, "/login/session/refresh", {
    body: { session_token: sessionToken },
    method: "POST",
  });
}

/**
 * Trigger a password-recovery email.
 * Maps to POST /password-recovery/{email} — email is a URL path segment.
 */
export function requestPasswordRecovery(
  config: AuthConfig,
  email: string
): Promise<MessageResponse> {
  return authApiFetch<MessageResponse>(
    config,
    `/password-recovery/${encodeURIComponent(email)}`,
    { method: "POST" }
  );
}

/**
 * Complete a password reset using the token from the recovery email.
 * Maps to POST /reset-password/ with body { token, new_password }.
 */
export function resetPassword(
  config: AuthConfig,
  input: { token: string; newPassword: string }
): Promise<MessageResponse> {
  return authApiFetch<MessageResponse>(config, "/reset-password/", {
    body: { token: input.token, new_password: input.newPassword },
    method: "POST",
  });
}

/**
 * Self-registration — creates a new user account.
 * Maps to POST /auth/users/signup.
 */
export function signUp(
  config: AuthConfig,
  input: {
    email: string;
    username: string;
    password: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
  }
): Promise<UserPublic> {
  return authApiFetch<UserPublic>(config, "/auth/users/signup", {
    body: {
      email: input.email,
      username: input.username,
      password: input.password,
      first_name: input.firstName,
      last_name: input.lastName,
      middle_name: input.middleName ?? null,
    },
    method: "POST",
  });
}

/**
 * OAuth2 password grant — returns a short-lived bearer token.
 * Maps to POST /login/access-token (application/x-www-form-urlencoded).
 * Use the session flow for browser auth; this is for machine / API consumers.
 */
export function loginWithPassword(
  config: AuthConfig,
  input: { username: string; password: string }
): Promise<Token> {
  return authApiFormFetch<Token>(config, "/login/access-token", {
    grant_type: "password",
    username: input.username,
    password: input.password,
  });
}
