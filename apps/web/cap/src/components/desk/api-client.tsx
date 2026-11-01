"use client";

import { configureApiClient } from "@barrelsgd/api-client";
import { DESK_API_PREFIX } from "@/lib/desk/proxy-rules";

let configured = false;

/**
 * Points the generated client at the desk's allow-listed proxy
 * (`/desk/api/v1/...`), which adds the forecaster's staff token server-side.
 * The browser never holds a token.
 */
export function DeskApiClient() {
  if (!configured) {
    configureApiClient({ baseURL: DESK_API_PREFIX });
    configured = true;
  }
  return null;
}
