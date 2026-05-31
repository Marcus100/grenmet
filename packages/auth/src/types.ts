export interface AuthConfig {
  appName: string;
  authApiBaseUrl: string;
  authApiPrefix: string;
  authAppUrl: string;
  sessionCookieDomain?: string;
  sessionCookieName: string;
}

// Returned inside session/access-token responses (trimmed subset).
export interface SessionUserPublic {
  email: string;
  full_name: string | null;
  id: string;
  is_active: boolean;
  is_superuser: boolean;
}

// Full user profile returned by /auth/users/* and /auth/users/signup.
export interface UserPublic {
  created_at: string;
  email: string;
  first_name: string;
  full_name: string;
  id: string;
  is_active: boolean;
  is_superuser: boolean;
  last_name: string;
  middle_name: string | null;
  updated_at: string;
  username: string;
}

// Short-lived bearer token returned by POST /login/access-token.
export interface Token {
  access_token: string;
  token_type: string;
}

// Generic success envelope returned by password-recovery and reset-password.
export interface MessageResponse {
  message: string;
}

export interface SessionPublic {
  app_name: string | null;
  client_type: string;
  created_at: string;
  expires_at: string;
  id: string;
  last_used_at: string;
  revoked_at: string | null;
  updated_at: string;
  user_id: string;
}

export interface SessionAccessTokenResponse {
  access_token: string;
  access_token_expires_at: string;
  session: SessionPublic;
  session_expires_at: string;
  token_type: "bearer";
  user: SessionUserPublic;
}

export interface SessionLoginResponse extends SessionAccessTokenResponse {
  session_token: string;
}

export class AuthApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "AuthApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function isAuthApiError(error: unknown): error is AuthApiError {
  return error instanceof AuthApiError;
}
