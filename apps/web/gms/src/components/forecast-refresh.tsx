"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-read publications and schedule boundaries on an already-open weather page. */
export function ForecastRefresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  return null;
}
