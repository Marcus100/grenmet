"use client";

import { configureApiClient } from "@grenmet/api-client";

let initialized = false;

export function initApiClient(): void {
  if (initialized) return;
  configureApiClient({
    baseURL: "",
  });
  initialized = true;
}
