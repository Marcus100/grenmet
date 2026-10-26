// API client that carries the visitor's address to FastAPI, so sign-up rate
// limits key on the visitor and not on this server (src/rate_limit.py).
// Without TRUSTED_WEB_SECRET no headers are sent: every visitor then shares
// this server's bucket, as before. Server only.

import "server-only";

import { createClient } from "@barrelsgd/api-client";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { visitorHeaders } from "@/lib/visitor-headers";

export async function visitorClient() {
  const visitor = visitorHeaders(
    await headers(),
    env.TRUSTED_WEB_SECRET,
    env.VISITOR_IP_PROXY_HOPS
  );
  return createClient({ baseURL: env.AUTH_API_URL, headers: visitor });
}
