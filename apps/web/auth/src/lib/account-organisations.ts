import "server-only";

import {
  createClient,
  organisationsAcceptInvitation,
  organisationsListMine,
} from "@barrelsgd/api-client";
import { getAuthConfig } from "./auth-config";

/** Organisation memberships and invitations on the account page (ADR-0022). */

const API_PREFIX = /\/api\/v1(?=\/|$)/u;

function bearerClient(accessToken: string) {
  const config = getAuthConfig();
  // An isolated instance keeps one user's bearer token out of shared server state.
  const client = createClient({
    baseURL: config.authApiBaseUrl,
    headers: { Authorization: `Bearer ${accessToken}` },
    options: { cache: "no-store" },
  });
  client.interceptors.request.use((request) => ({
    ...request,
    url: request.url.replace(API_PREFIX, config.authApiPrefix),
    signal: AbortSignal.timeout(10_000),
  }));
  return client;
}

export function listMyOrganisations(accessToken: string) {
  return organisationsListMine({ client: bearerClient(accessToken) }).unwrap();
}

/** The token goes in the request body, never in a path or query string. */
export function acceptOrganisationInvitation(
  accessToken: string,
  token: string
) {
  return organisationsAcceptInvitation({
    body: { token },
    client: bearerClient(accessToken),
  }).unwrap();
}

/** Failures the accept page can explain; anything else is thrown. */
export type AcceptFailure = "invalid" | "wrong-email" | "failed";

export function describeAcceptFailure(error: unknown): AcceptFailure {
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 400) return "invalid";
  if (status === 403) return "wrong-email";
  return "failed";
}
