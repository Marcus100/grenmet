import { getAuthConfig } from "@/src/lib/auth-config";
import {
  getSafeLocalReturnTo,
  getRequestOrigin,
  buildSharedSignInUrl as _buildSharedSignInUrl,
} from "@grenmet/auth/server";

export { getSafeLocalReturnTo, getRequestOrigin };

export function buildSharedSignInUrl(input: {
  origin: string;
  returnTo?: string | null;
}): string {
  return _buildSharedSignInUrl(getAuthConfig(), input);
}
