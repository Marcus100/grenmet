import "server-only";

import { specApiV1JanitorialSpecGetResponseSchema } from "@barrelsgd/api-client";
import {
  getAuthApiBaseUrl,
  getAuthApiPrefix,
  getSessionCookieName,
} from "@/lib/auth-config";
import { readSessionCookie } from "@/lib/server-session";

export type {
  AreaView,
  BuildingView,
  BundleView,
  Frequency,
  SectionView,
  TaskView,
} from "@barrelsgd/api-client";

export async function getJanitorialSpec() {
  const secret = await readSessionCookie();
  if (!secret) throw new Error("Sign in to view the janitorial catalogue");
  const response = await fetch(
    new URL(`${getAuthApiPrefix()}/janitorial/spec`, getAuthApiBaseUrl()),
    {
      headers: {
        Cookie: `${getSessionCookieName()}=${encodeURIComponent(secret)}`,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!response.ok) throw new Error("Janitorial catalogue unavailable");
  return specApiV1JanitorialSpecGetResponseSchema.parse(await response.json());
}
