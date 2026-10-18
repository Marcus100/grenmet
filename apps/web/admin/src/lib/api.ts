import "server-only";

import {
  organisationAdminDetailSchema,
  organisationAdminListPublicSchema,
} from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { getAuthConfig } from "@/lib/auth-config";

export const ORGANISATIONS_PAGE_SIZE = 25;

export interface OrganisationFilters {
  kind?: string;
  page: number;
  q?: string;
  status?: string;
}

/** Superuser-only `GET /organisations` (apps/api/fastapi/src/organisations). */
export function listOrganisations(
  accessToken: string,
  filters: OrganisationFilters
) {
  const params = new URLSearchParams({
    page: String(filters.page),
    size: String(ORGANISATIONS_PAGE_SIZE),
  });
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.kind) params.set("kind", filters.kind);
  return authApiFetch(
    getAuthConfig(),
    `/organisations?${params}`,
    organisationAdminListPublicSchema,
    { accessToken }
  );
}

/** Superuser-only `GET /organisations/{id}`. */
export function getOrganisation(accessToken: string, organisationId: string) {
  return authApiFetch(
    getAuthConfig(),
    `/organisations/${encodeURIComponent(organisationId)}`,
    organisationAdminDetailSchema,
    { accessToken }
  );
}
