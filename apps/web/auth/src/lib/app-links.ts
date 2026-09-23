import type { AppId } from "@/components/app-directory";
import { env } from "@/lib/env";

const DEV_FALLBACKS: Record<AppId, string> = {
  admin: "http://localhost:3001",
  docs: "http://localhost:3002",
  weather: "http://localhost:3003",
  signal: "http://localhost:3004",
  mbia: "http://localhost:3005",
  events: "http://localhost:3009",
};

export function getAppHrefs(): Partial<Record<AppId, string>> {
  const configured: Partial<Record<AppId, string | undefined>> = {
    admin: env.ADMIN_APP_URL,
    docs: env.DOCS_APP_URL,
    weather: env.GMS_APP_URL,
    signal: env.SIGNAL_APP_URL,
    mbia: env.MBIA_APP_URL,
    events: env.EVENTS_APP_URL,
  };
  const useFallback = env.NODE_ENV === "development";
  const hrefs: Partial<Record<AppId, string>> = {};
  for (const id of Object.keys(DEV_FALLBACKS) as AppId[]) {
    const href =
      configured[id] ?? (useFallback ? DEV_FALLBACKS[id] : undefined);
    if (href) hrefs[id] = href;
  }
  return hrefs;
}
