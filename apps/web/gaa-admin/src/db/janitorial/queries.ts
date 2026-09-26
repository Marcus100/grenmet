import "server-only";

import {
  janitorialGetAccessResponseSchema,
  janitorialGetCatalogueResponseSchema,
  janitorialGetShiftBoardResponseSchema,
  janitorialListGrantsResponseSchema,
  janitorialListStaffResponseSchema,
} from "@barrelsgd/api-client";
import type { z } from "zod";
import {
  getAuthApiBaseUrl,
  getAuthApiPrefix,
  getSessionCookieName,
} from "@/lib/auth-config";
import { readSessionCookie } from "@/lib/server-session";

export type {
  JanitorialAccess,
  JanitorialArea,
  JanitorialBuilding,
  JanitorialCatalogue,
  JanitorialGrant,
  JanitorialShiftBoard,
  JanitorialStaffList,
} from "@barrelsgd/api-client";

async function janitorialGet<T extends z.ZodType>(
  path: string,
  schema: T
): Promise<z.infer<T>> {
  const secret = await readSessionCookie();
  if (!secret) throw new Error("Sign in to view the janitorial portal");
  const response = await fetch(
    new URL(`${getAuthApiPrefix()}/janitorial${path}`, getAuthApiBaseUrl()),
    {
      headers: {
        Cookie: `${getSessionCookieName()}=${encodeURIComponent(secret)}`,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!response.ok) throw new Error("Janitorial portal data unavailable");
  return schema.parse(await response.json());
}

export function getJanitorialAccess() {
  return janitorialGet("/access", janitorialGetAccessResponseSchema);
}

/** Catalogue for one site (e.g. "GND") or every site, limited to the user's buildings. */
export function getJanitorialCatalogue(site?: string) {
  return janitorialGet(
    site ? `/catalogue?${new URLSearchParams({ site })}` : "/catalogue",
    janitorialGetCatalogueResponseSchema
  );
}

export function getJanitorialStaff() {
  return janitorialGet("/staff", janitorialListStaffResponseSchema);
}

export function getJanitorialGrants() {
  return janitorialGet("/grants", janitorialListGrantsResponseSchema);
}

export function getJanitorialShiftBoard(
  site: string,
  from: string,
  to: string
) {
  return janitorialGet(
    `/shifts?${new URLSearchParams({ site, from, to })}`,
    janitorialGetShiftBoardResponseSchema
  );
}
