import { getAuthConfig } from "@/lib/auth-config";
import {
  getSafeLocalReturnTo,
  getRequestOrigin,
  buildSharedSignInUrl as _buildSharedSignInUrl,
} from "@grenmet/auth/server";

export { getSafeLocalReturnTo, getRequestOrigin };

function firstValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

export function readQueryParam(
  value: string | string[] | undefined,
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
