import "server-only";

import { specApiV1TransportSpecGetResponseSchema } from "@barrelsgd/api-client";
import {
  getAuthApiBaseUrl,
  getAuthApiPrefix,
  getSessionCookieName,
} from "@/lib/auth-config";
import { readSessionCookie } from "@/lib/server-session";

export type {
  RouteView,
  ShiftView,
  StopView,
  TripView,
} from "@barrelsgd/api-client";

export async function getTransportSpec() {
  const secret = await readSessionCookie();
  if (!secret) throw new Error("Sign in to view the transport timetable");
  const response = await fetch(
    new URL(`${getAuthApiPrefix()}/transport/spec`, getAuthApiBaseUrl()),
    {
      headers: {
        Cookie: `${getSessionCookieName()}=${encodeURIComponent(secret)}`,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!response.ok) throw new Error("Transport timetable unavailable");
  return specApiV1TransportSpecGetResponseSchema.parse(await response.json());
}
