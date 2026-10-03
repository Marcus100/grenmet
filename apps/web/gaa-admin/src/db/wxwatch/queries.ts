import "server-only";
import {
  type SynopticImageGroup,
  synopticImageGroupsSchema,
} from "@barrelsgd/api-client";
import {
  getAuthApiBaseUrl,
  getAuthApiPrefix,
  getSessionCookieName,
} from "@/lib/auth-config";
import { readSessionCookie } from "@/lib/server-session";

export type ImagesBySynoptic = SynopticImageGroup[];

/** Rendering adapter only: FastAPI owns date filtering and image selection. */
export async function getImagesByDateAndSynoptic(
  date: Date
): Promise<ImagesBySynoptic> {
  const secret = await readSessionCookie();
  if (!secret) throw new Error("Sign in to view weather imagery");
  const url = new URL(
    `${getAuthApiPrefix()}/wxwatch/metadata`,
    getAuthApiBaseUrl()
  );
  url.searchParams.set("day", date.toISOString().slice(0, 10));
  const response = await fetch(url, {
    headers: {
      Cookie: `${getSessionCookieName()}=${encodeURIComponent(secret)}`,
    },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Weather image metadata unavailable");
  return synopticImageGroupsSchema.parse(await response.json()).groups;
}

export async function checkImageryReady(): Promise<boolean> {
  try {
    const url = new URL(
      `${getAuthApiPrefix()}/wxwatch/ready`,
      getAuthApiBaseUrl()
    );
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    return response.status === 204;
  } catch {
    return false;
  }
}

export async function getArchive(params: URLSearchParams) {
  const { archivePageSchema } = await import("@barrelsgd/api-client");
  return archivePageSchema.parse(
    await archiveRequest(`/wxwatch/archive?${params}`)
  );
}

export async function getArchiveHistory(edition: string, offset = "0") {
  const { archiveHistorySchema } = await import("@barrelsgd/api-client");
  return archiveHistorySchema.parse(
    await archiveRequest(
      `/wxwatch/archive/${encodeURIComponent(edition)}/retrievals?offset=${encodeURIComponent(offset)}`
    )
  );
}

async function archiveRequest(path: string): Promise<unknown> {
  const secret = await readSessionCookie();
  if (!secret) throw new Error("Sign in to view the archive");
  const response = await fetch(
    new URL(`${getAuthApiPrefix()}${path}`, getAuthApiBaseUrl()),
    {
      headers: {
        Cookie: `${getSessionCookieName()}=${encodeURIComponent(secret)}`,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (response.status === 422)
    throw new Error(
      "Invalid archive filters. Check the date range; unknown-time searches must have no dates."
    );
  if (!response.ok) throw new Error("Archive unavailable. Try again later.");
  return response.json();
}
