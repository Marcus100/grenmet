import { buildSharedSignInUrl as _buildSharedSignInUrl } from "@grenmet/auth/server";

export { getRequestOrigin, getSafeLocalReturnTo } from "@grenmet/auth/server";

import { getAuthConfig } from "@/lib/auth-config";

function firstValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

export function readQueryParam(
  value: string | string[] | undefined
): string | null {
  const first = firstValue(value);
  return first ? first.trim() : null;
}

export function buildSharedSignInUrl(input: {
  origin: string;
  returnTo?: string | null;
}): string {
  return _buildSharedSignInUrl(getAuthConfig(), input);
}
