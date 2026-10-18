import "server-only";

import {
  storesGetAccessResponseSchema,
  storesListItemsResponseSchema,
  storesListLocationsResponseSchema,
  storesListRequisitionsResponseSchema,
} from "@barrelsgd/api-client";
import type { z } from "zod";
import {
  getAuthApiBaseUrl,
  getAuthApiPrefix,
  getSessionCookieName,
} from "@/lib/auth-config";
import { readSessionCookie } from "@/lib/server-session";

export type {
  ItemPublic,
  LocationPublic,
  RequisitionLinePublic,
  RequisitionPublic,
  RequisitionStatus,
  StoresAccessPublic,
} from "@barrelsgd/api-client";

async function storesGet<T extends z.ZodType>(
  path: string,
  schema: T
): Promise<z.infer<T>> {
  const secret = await readSessionCookie();
  if (!secret) throw new Error("Sign in to use the stores");
  const response = await fetch(
    new URL(`${getAuthApiPrefix()}/stores${path}`, getAuthApiBaseUrl()),
    {
      headers: {
        Cookie: `${getSessionCookieName()}=${encodeURIComponent(secret)}`,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (response.status === 403) throw new StoresAccessError();
  if (!response.ok) throw new Error("Stores data unavailable");
  return schema.parse(await response.json());
}

/** The signed-in user has no stores permission or employment record. */
export class StoresAccessError extends Error {
  constructor() {
    super("Stores access needed");
  }
}

export function getStoresAccess() {
  return storesGet("/access", storesGetAccessResponseSchema);
}

/** Active catalogue items (every page up to the API maximum). */
export async function getCatalogue(options: { activeOnly?: boolean } = {}) {
  const query = new URLSearchParams({ size: "1000" });
  if (options.activeOnly) query.set("active", "true");
  const result = await storesGet(
    `/items?${query}`,
    storesListItemsResponseSchema
  );
  return result.data;
}

/** Null when the user has no employment record or no stores permission. */
export async function getStoresAccessOrNull() {
  try {
    const access = await getStoresAccess();
    return access.can_view ? access : null;
  } catch (error) {
    if (error instanceof StoresAccessError) return null;
    throw error;
  }
}

export async function getLocations() {
  const result = await storesGet(
    "/locations",
    storesListLocationsResponseSchema
  );
  return result.data;
}

export async function getRequisitions(
  options: { statuses?: string[]; mine?: boolean } = {}
) {
  const query = new URLSearchParams({ size: "200" });
  for (const status of options.statuses ?? []) query.append("status", status);
  if (options.mine) query.set("mine", "true");
  const result = await storesGet(
    `/requisitions?${query}`,
    storesListRequisitionsResponseSchema
  );
  return result;
}
