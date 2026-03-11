import type { UserPublic } from "@grenmet/api-client";
import type { TokenStore } from "./token-store.js";

export interface Token {
  access_token: string;
  token_type: string;
}

export interface LoginParams {
  email: string;
  password: string;
}

export interface LoginResult {
  token: Token;
}

export type SessionUser = UserPublic;

export interface AuthClientConfig {
  baseURL?: string;
  tokenStore?: TokenStore;
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
