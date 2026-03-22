import { buildSharedSignInUrl as _buildSharedSignInUrl } from "@grenmet/auth/server";

export { getRequestOrigin, getSafeLocalReturnTo } from "@grenmet/auth/server";

import { getAuthConfig } from "./auth-config";

export function buildSharedSignInUrl(input: {
  origin: string;
  returnTo?: string | null;
}): string {
  return _buildSharedSignInUrl(getAuthConfig(), input);
}
