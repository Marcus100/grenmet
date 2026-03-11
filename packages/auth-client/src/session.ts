import { readUserMeApiV1AuthUsersMeGet } from "@grenmet/api-client";
import { getDefaultTokenStore } from "./token-store.js";
import type { TokenStore } from "./token-store.js";
import { normalizeAuthError } from "./errors.js";
import type { SessionUser } from "./types.js";

export function getAccessToken(store?: TokenStore): string | null {
  return (store ?? getDefaultTokenStore()).getToken();
}

export function isAuthenticated(store?: TokenStore): boolean {
  return getAccessToken(store) !== null;
}

export async function getCurrentUser(): Promise<SessionUser> {
  try {
    return await readUserMeApiV1AuthUsersMeGet();
  } catch (error) {
    throw normalizeAuthError(error, "Failed to fetch current user");
  }
}
