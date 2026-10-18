import "server-only";

import {
  accessRequestPublicSchema,
  accessStatusPublicSchema,
  guidanceCatalogueSchema,
  guidanceOrganisationPublicSchema,
  meteogramPublicSchema,
} from "@barrelsgd/api-client";
import { z } from "zod";
import { getAuthConfig } from "@/lib/auth-config";

const TIMEOUT_MS = 10_000;

export class GuidanceApiError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "GuidanceApiError";
    this.status = status;
  }
}

interface CallOptions {
  accessToken: string;
  body?: unknown;
  method?: "GET" | "POST";
  organisationId?: string;
}

/**
 * Server-side call to `/models/*` with the app-scoped token. The shared
 * `authApiFetch` cannot add the `X-Barrels-Organisation` header these routes
 * need, so this is the one place that does.
 */
async function call<T>(
  path: string,
  parser: { parse: (payload: unknown) => T },
  options: CallOptions
): Promise<T> {
  const config = getAuthConfig();
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${options.accessToken}`,
  });
  if (options.organisationId) {
    headers.set("x-barrels-organisation", options.organisationId);
  }
  if (options.body !== undefined)
    headers.set("content-type", "application/json");
  const response = await fetch(
    `${config.authApiBaseUrl}${config.authApiPrefix}${path}`,
    {
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      headers,
      method: options.method ?? "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const payload: unknown = await response.json();
      if (
        typeof payload === "object" &&
        payload !== null &&
        "detail" in payload &&
        typeof payload.detail === "string"
      ) {
        detail = payload.detail;
      }
    } catch {
      // Keep the generic message when the body is not JSON.
    }
    throw new GuidanceApiError(response.status, detail);
  }
  return parser.parse(await response.json());
}

export function listMyOrganisations(accessToken: string) {
  return call(
    "/models/organisations",
    z.array(guidanceOrganisationPublicSchema),
    {
      accessToken,
    }
  );
}

export function getCatalogue(accessToken: string, organisationId: string) {
  return call("/models/catalogue", guidanceCatalogueSchema, {
    accessToken,
    organisationId,
  });
}

export function getMeteogram(
  accessToken: string,
  organisationId: string,
  point: string,
  model: string
) {
  const query = new URLSearchParams({ model, point });
  return call(`/models/meteogram?${query}`, meteogramPublicSchema, {
    accessToken,
    organisationId,
  });
}

export function getAccessStatus(accessToken: string, organisationId: string) {
  return call("/models/access", accessStatusPublicSchema, {
    accessToken,
    organisationId,
  });
}

export function requestAccess(
  accessToken: string,
  organisationId: string,
  note: string
) {
  return call("/models/access-requests", accessRequestPublicSchema, {
    accessToken,
    body: note ? { note } : {},
    method: "POST",
    organisationId,
  });
}
