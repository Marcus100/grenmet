import { loginAccessTokenApiV1LoginAccessTokenPost } from "@grenmet/api-client";
import type { LoginParams, LoginResult } from "./types.js";
import { getDefaultTokenStore } from "./token-store.js";
import type { TokenStore } from "./token-store.js";
import { coerceToken, normalizeAuthError } from "./errors.js";

export async function login(
  params: LoginParams,
  options?: { tokenStore?: TokenStore; persistToken?: boolean }
): Promise<LoginResult> {
  try {
    const token = coerceToken(
      await loginAccessTokenApiV1LoginAccessTokenPost({
        username: params.email,
        password: params.password,
      })
    );

    const store = options?.tokenStore ?? getDefaultTokenStore();
    if (options?.persistToken !== false) {
      store.setToken(token.access_token);
    }

    return { token };
  } catch (error) {
    throw normalizeAuthError(error, "Login failed");
  }
}

export function logout(store?: TokenStore): void {
  const s = store ?? getDefaultTokenStore();
  s.clearToken();
}
