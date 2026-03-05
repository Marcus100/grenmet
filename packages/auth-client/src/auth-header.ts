import type { TokenStore } from "./token-store.js";
import { getDefaultTokenStore } from "./token-store.js";

export function getAuthHeader(
  store?: TokenStore
): { Authorization: string } | Record<string, never> {
  const s = store ?? getDefaultTokenStore();
  const token = s.getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
