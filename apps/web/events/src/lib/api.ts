import "server-only";

import { createClient } from "@barrelsgd/api-client";
import { env } from "@/env";

/**
 * Options for a generated API call, bound to this request's own client so a
 * member's token is never shared across concurrent requests.
 */
export function apiOptions(accessToken?: string) {
  return {
    client: createClient({
      baseURL: env.AUTH_API_URL,
      ...(accessToken ? { auth: accessToken } : {}),
    }),
  };
}
