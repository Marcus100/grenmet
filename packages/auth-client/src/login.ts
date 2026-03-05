import type { LoginParams, LoginResult, Token } from "./types.js";
import { AuthError } from "./types.js";
import { getDefaultTokenStore } from "./token-store.js";
import type { TokenStore } from "./token-store.js";
import { getApiBaseUrl } from "./get-api-base-url.js";

const LOGIN_PATH = "/api/v1/login/access-token";

export async function login(
  params: LoginParams,
  options?: { tokenStore?: TokenStore; persistToken?: boolean }
): Promise<LoginResult> {
  const { email, password } = params;
  const base = (params.apiBaseUrl ?? getApiBaseUrl()).replace(/\/$/, "");
  const url = base ? `${base}${LOGIN_PATH}` : LOGIN_PATH;

  const body = new URLSearchParams({
    username: email,
    password,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const message =
      typeof (detail as { detail?: string })?.detail === "string"
        ? (detail as { detail: string }).detail
        : "Login failed";
    throw new AuthError(message, res.status, message);
  }

  const token = (await res.json()) as Token;
  const store = options?.tokenStore ?? getDefaultTokenStore();
  if (options?.persistToken !== false) {
    store.setToken(token.access_token);
  }
  return { token };
}

export function logout(store?: TokenStore): void {
  const s = store ?? getDefaultTokenStore();
  s.clearToken();
}
