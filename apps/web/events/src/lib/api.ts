import "server-only";

import { createClient } from "@barrelsgd/api-client";
import { headers } from "next/headers";
import { env } from "@/env";
import { visitorHeaders } from "@/lib/visitor-headers";

/**
 * Options for a generated API call, bound to this request's own client so a
 * member's token is never shared across concurrent requests. Next calls the API
 * from one address, so the visitor's own address travels in headers the API
 * trusts only with the shared secret (src/rate_limit.py). Never used for the
 * /auth email-code routes: the API ignores the headers there by design.
 */
export async function apiOptions(accessToken?: string) {
  const visitor = visitorHeaders(
    await headers(),
    env.TRUSTED_WEB_SECRET,
    env.VISITOR_IP_PROXY_HOPS
  );
  return {
    client: createClient({
      baseURL: env.AUTH_API_URL,
      headers: visitor,
      ...(accessToken ? { auth: accessToken } : {}),
    }),
  };
}
