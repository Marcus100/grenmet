import "server-only";

import {
  transportGetAccessResponseSchema,
  transportGetCatalogueResponseSchema,
  transportGetCurrentTimetableResponseSchema,
  transportGetTimetableVersionResponseSchema,
  transportListTimetableVersionsResponseSchema,
} from "@barrelsgd/api-client";
import type { z } from "zod";
import {
  getAuthApiBaseUrl,
  getAuthApiPrefix,
  getSessionCookieName,
} from "@/lib/auth-config";
import { readSessionCookie } from "@/lib/server-session";

export type {
  TimetableIssue,
  TimetableTripView,
  TimetableVersionDetail,
  TimetableVersionSummary,
  TransportAccess,
  TransportCatalogue,
  TransportRoute,
  TransportStop,
} from "@barrelsgd/api-client";

class TransportNotFound extends Error {}

async function transportGet<T extends z.ZodType>(
  path: string,
  schema: T
): Promise<z.infer<T>> {
  const secret = await readSessionCookie();
  if (!secret) throw new Error("Sign in to view the bus portal");
  const response = await fetch(
    new URL(`${getAuthApiPrefix()}/transport${path}`, getAuthApiBaseUrl()),
    {
      headers: {
        Cookie: `${getSessionCookieName()}=${encodeURIComponent(secret)}`,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (response.status === 404) throw new TransportNotFound(path);
  if (!response.ok) throw new Error("Bus portal data unavailable");
  return schema.parse(await response.json());
}

export function getTransportAccess() {
  return transportGet("/access", transportGetAccessResponseSchema);
}

export function getTransportCatalogue() {
  return transportGet("/catalogue", transportGetCatalogueResponseSchema);
}

export function getTimetableVersions() {
  return transportGet(
    "/timetable/versions",
    transportListTimetableVersionsResponseSchema
  );
}

/** The timetable in force today, or null before any has been published. */
export async function getCurrentTimetable() {
  try {
    return await transportGet(
      "/timetable/current",
      transportGetCurrentTimetableResponseSchema
    );
  } catch (error) {
    if (error instanceof TransportNotFound) return null;
    throw error;
  }
}

/** A timetable version, or null when the id doesn't exist. */
export async function getTimetableVersion(versionId: number) {
  try {
    return await transportGet(
      `/timetable/versions/${versionId}`,
      transportGetTimetableVersionResponseSchema
    );
  } catch (error) {
    if (error instanceof TransportNotFound) return null;
    throw error;
  }
}
