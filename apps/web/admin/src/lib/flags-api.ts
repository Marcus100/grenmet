import "server-only";

import {
  type FeatureFlagCreate,
  type FeatureFlagUpdate,
  featureFlagAdminListSchema,
  featureFlagAdminSchema,
} from "@barrelsgd/api-client";
import { authApiFetch, authApiFetchResponse } from "@barrelsgd/auth/server";
import { getAuthConfig } from "@/lib/auth-config";

// Superuser plus `feature_flags.manage` (apps/api/fastapi/src/feature_flags).
// FastAPI owns the success-metric rule and the cache; this only proxies.

export const FLAGS_PAGE_SIZE = 100;

function flagPath(flagId: string): string {
  return `/feature-flags/admin/${encodeURIComponent(flagId)}`;
}

export function listFlags(accessToken: string) {
  return authApiFetch(
    getAuthConfig(),
    `/feature-flags/admin?size=${FLAGS_PAGE_SIZE}`,
    featureFlagAdminListSchema,
    { accessToken }
  );
}

export function listStaleFlags(accessToken: string) {
  return authApiFetch(
    getAuthConfig(),
    "/feature-flags/admin/stale",
    featureFlagAdminListSchema,
    { accessToken }
  );
}

export function getFlag(accessToken: string, flagId: string) {
  return authApiFetch(
    getAuthConfig(),
    flagPath(flagId),
    featureFlagAdminSchema,
    { accessToken }
  );
}

export function createFlag(accessToken: string, body: FeatureFlagCreate) {
  return authApiFetch(
    getAuthConfig(),
    "/feature-flags/admin",
    featureFlagAdminSchema,
    { accessToken, method: "POST", body }
  );
}

export function updateFlag(
  accessToken: string,
  flagId: string,
  body: FeatureFlagUpdate
) {
  return authApiFetch(
    getAuthConfig(),
    flagPath(flagId),
    featureFlagAdminSchema,
    { accessToken, method: "PATCH", body }
  );
}

export async function deleteFlag(accessToken: string, flagId: string) {
  await authApiFetchResponse(getAuthConfig(), flagPath(flagId), {
    accessToken,
    method: "DELETE",
  });
}
