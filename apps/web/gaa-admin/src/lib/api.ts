"use client";

import { configureApiClient } from "@barrelsgd/api-client";

let initialized = false;

export function initApiClient(): void {
  if (initialized) return;
  configureApiClient({
    baseURL: "",
  });
  initialized = true;
}
