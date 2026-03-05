export interface Token {
  access_token: string;
  token_type: string;
}

export interface LoginParams {
  apiBaseUrl?: string;
  email: string;
  password: string;
}

export interface LoginResult {
  token: Token;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public detail?: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}
