"use client";

import { useEffect } from "react";
import { env } from "@/.env";
import { initApiClient } from "@/lib/api";

export function ApiProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== "undefined" && env.NEXT_PUBLIC_API_URL) {
      (window as unknown as { __GRENMET_API_URL__?: string }).__GRENMET_API_URL__ =
        env.NEXT_PUBLIC_API_URL;
    }
    initApiClient();
  }, []);
  return <>{children}</>;
}
