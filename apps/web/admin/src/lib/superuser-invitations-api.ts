import "server-only";

import {
  authListSuperuserInvitationsResponseSchema,
  superuserInvitationPublicSchema,
} from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { getAuthConfig } from "@/lib/auth-config";

// Superuser with an authenticator and a two-step sign-in (apps/api/fastapi/src/auth).
// The API owns every rule; this only proxies. Tokens are never returned by the API.

export interface SuperuserInvitationInput {
  email: string;
  reason: string;
}

export function listSuperuserInvitations(accessToken: string) {
  return authApiFetch(
    getAuthConfig(),
    "/auth/superuser-invitations",
    authListSuperuserInvitationsResponseSchema,
    { accessToken }
  );
}

export function createSuperuserInvitation(
  accessToken: string,
  body: SuperuserInvitationInput
) {
  return authApiFetch(
    getAuthConfig(),
    "/auth/superuser-invitations",
    superuserInvitationPublicSchema,
    { accessToken, method: "POST", body }
  );
}

export function revokeSuperuserInvitation(
  accessToken: string,
  invitationId: string
) {
  return authApiFetch(
    getAuthConfig(),
    `/auth/superuser-invitations/${encodeURIComponent(invitationId)}/revoke`,
    superuserInvitationPublicSchema,
    { accessToken, method: "POST" }
  );
}
