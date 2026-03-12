export interface AuthConfig {
  appName: string;
  authApiBaseUrl: string;
  authApiPrefix: string;
  authAppUrl: string;
  sessionCookieDomain?: string;
  sessionCookieName: string;
}

export interface SessionUserPublic {
  email: string;
  full_name: string | null;
  id: string;
  is_active: boolean;
  is_superuser: boolean;
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
