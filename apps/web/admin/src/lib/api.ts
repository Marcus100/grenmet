import "server-only";

import {
  memberListPublicSchema,
  organisationAdminDetailSchema,
  organisationAdminListPublicSchema,
  paginatedResponseAuditEntryPublicSchema,
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

export const MEMBERS_PAGE_SIZE = 50;
export const HISTORY_PAGE_SIZE = 20;

/** Superuser-only roster of any organisation. */
export function listOrganisationMembers(
  accessToken: string,
  organisationId: string
) {
  return authApiFetch(
    getAuthConfig(),
    `/organisations/${encodeURIComponent(organisationId)}/admin/members?size=${MEMBERS_PAGE_SIZE}`,
    memberListPublicSchema,
    { accessToken }
  );
}

/** Change history for an organisation (`/audit/platform_organisation/{id}`). */
export function getOrganisationHistory(
  accessToken: string,
  organisationId: string
) {
  return authApiFetch(
    getAuthConfig(),
    `/audit/platform_organisation/${encodeURIComponent(organisationId)}?size=${HISTORY_PAGE_SIZE}`,
    paginatedResponseAuditEntryPublicSchema,
    { accessToken }
  );
}

export interface OrganisationEdit {
  kind?: string;
  name?: string;
  slug?: string;
  status?: string;
}

/** Superuser-only `POST /organisations`. */
export function createOrganisation(
  accessToken: string,
  body: { kind: string; name: string; slug?: string }
) {
  return authApiFetch(
    getAuthConfig(),
    "/organisations",
    organisationAdminDetailSchema,
    { accessToken, method: "POST", body }
  );
}

/** Superuser-only `PATCH /organisations/{id}`. */
export function updateOrganisation(
  accessToken: string,
  organisationId: string,
  body: OrganisationEdit
) {
  return authApiFetch(
    getAuthConfig(),
    `/organisations/${encodeURIComponent(organisationId)}`,
    organisationAdminDetailSchema,
    { accessToken, method: "PATCH", body }
  );
}

/** Superuser-only verify or unverify; the reason lands in the history. */
export function decideVerification(
  accessToken: string,
  organisationId: string,
  decision: "verify" | "unverify",
  reason: string
) {
  return authApiFetch(
    getAuthConfig(),
    `/organisations/${encodeURIComponent(organisationId)}/${decision}`,
    organisationAdminDetailSchema,
    { accessToken, method: "POST", body: { reason } }
  );
}

/** Superuser-only `PUT /organisations/{id}/apps/{key}`. */
export function setAppEntitlement(
  accessToken: string,
  organisationId: string,
  appKey: string,
  enabled: boolean
) {
  return authApiFetch(
    getAuthConfig(),
    `/organisations/${encodeURIComponent(organisationId)}/apps/${encodeURIComponent(appKey)}`,
    organisationAdminDetailSchema,
    { accessToken, method: "PUT", body: { enabled } }
  );
}
