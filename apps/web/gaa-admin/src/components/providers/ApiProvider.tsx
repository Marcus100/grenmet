"use client";

import { initApiClient } from "@/lib/api";

export function ApiProvider({ children }: { children: React.ReactNode }) {
  initApiClient();
  return <>{children}</>;
}
