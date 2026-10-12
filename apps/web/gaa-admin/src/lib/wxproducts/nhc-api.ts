import { browserSessionSchema } from "@barrelsgd/api-client";
import type { z } from "zod";

export const NHC_FAMILIES = {
  tropical_development: "Tropical development",
  active_cyclones: "Active cyclones",
  marine: "Marine",
  aviation_recon: "Aviation / reconnaissance",
} as const;

export async function nhcRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  payload?: unknown
): Promise<T> {
  let headers: Record<string, string> = {};
  if (payload !== undefined) {
    const sessionResponse = await fetch("/_backend/browser-session", {
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    if (!sessionResponse.ok)
      throw Object.assign(new Error("Sign in to use NHC guidance"), {
        status: sessionResponse.status,
      });
    const session = browserSessionSchema.parse(await sessionResponse.json());
    headers = {
      "Content-Type": "application/json",
      "X-CSRF-Token": session.csrfToken,
    };
  }
  const response = await fetch(`/_backend/wxwatch/nhc/${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers,
    method: payload === undefined ? "GET" : "POST",
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    let message =
      "NHC guidance unavailable. Check your connection and try again.";
    if (response.status === 403)
      message = "Your account is not authorised for this NHC operation";
    if (response.status === 422)
      message = "Check the selected sources, product and location";
    throw Object.assign(new Error(message), { status: response.status });
  }
  return schema.parse(await response.json());
}

export function nhcAssetUrl(assetId: string): string {
  return `/_backend/wxwatch/assets/${encodeURIComponent(assetId)}`;
}
