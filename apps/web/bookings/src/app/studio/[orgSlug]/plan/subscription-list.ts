// The plan's subscription list, including `purchasable` (which plans a checkout can
// start for now). Server only. It builds the same isolated client as the studio's
// other calls (the person's bearer token, the organisation header, no cache, a
// timeout, the auth API prefix) and keeps the whole response body, because the
// shared `listAppSubscriptions` reader returns only `data`.

import "server-only";

import {
  type AppSubscriptionListPublic,
  billingListAppSubscriptions,
  createClient,
} from "@barrelsgd/api-client";
import { getAuthConfig } from "@/lib/auth-config";
import { redactRequest } from "@/lib/redact-request";

const API_PREFIX = /\/api\/v1(?=\/|$)/u;
const TIMEOUT_MS = 10_000;

/** Reads the organisation's app subscriptions and the purchasable plan keys. */
export function readAppSubscriptionList(
  accessToken: string,
  organisationId: string
): Promise<AppSubscriptionListPublic> {
  const config = getAuthConfig();
  // An isolated instance keeps one user's bearer token out of shared server state.
  const client = createClient({
    baseURL: config.authApiBaseUrl,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Barrels-Organisation": organisationId,
    },
    options: { cache: "no-store" },
  });
  client.interceptors.request.use((request) => ({
    ...request,
    url: request.url.replace(API_PREFIX, config.authApiPrefix),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }));
  return billingListAppSubscriptions({ client }).unwrap().catch(redactRequest);
}
