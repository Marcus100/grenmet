"use client";

import { configureApiClient } from "@grenmet/api-client";
import { getAuthHeader } from "@grenmet/auth-client";
import { env } from "@/.env";

let initialized = false;

export function initApiClient(): void {
  if (initialized) return;
  configureApiClient({
    baseURL: env.NEXT_PUBLIC_API_URL || "",
    getHeaders: getAuthHeader,
  });
  initialized = true;
}
