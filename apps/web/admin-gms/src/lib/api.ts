"use client";

import { configureAuthClient } from "@grenmet/auth-client";
import { env } from "@/.env";

let initialized = false;

export function initApiClient(): void {
  if (initialized) return;
  configureAuthClient({
    baseURL: env.NEXT_PUBLIC_API_URL || "",
  });
  initialized = true;
}
