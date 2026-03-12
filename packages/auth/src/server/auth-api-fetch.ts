import "server-only";

import { cookies, headers } from "next/headers";
import type { NextResponse } from "next/server";
import type { AuthConfig } from "../types";
import { AuthApiError } from "../types";

interface AuthApiErrorPayload {
  detail?: unknown;
}

function buildCookieOptions(config: AuthConfig, expires?: Date) {
  return {
    ...(config.sessionCookieDomain
      ? { domain: config.sessionCookieDomain }
      : {}),
    ...(expires ? { expires } : {}),
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function clearSessionCookieOnResponse(
  config: AuthConfig,
  response: NextResponse
): void {
  response.cookies.set(config.sessionCookieName, "", {
    ...buildCookieOptions(config, new Date(0)),
    maxAge: 0,
  });
}

export async function readSessionCookie(
  config: AuthConfig
): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(config.sessionCookieName)?.value ?? null;
}

export async function writeSessionCookie(
  config: AuthConfig,
  sessionToken: string,
  sessionExpiresAt: string
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    config.sessionCookieName,
    sessionToken,
    buildCookieOptions(config, new Date(sessionExpiresAt))
  );
}

export async function clearSessionCookie(
  config: AuthConfig
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(config.sessionCookieName, "", {
    ...buildCookieOptions(config, new Date(0)),
    maxAge: 0,
  });
}

async function getForwardHeaders(): Promise<Headers> {
  const incomingHeaders = await headers();
  const forwardedHeaders = new Headers({
    accept: "application/json",
  });

  for (const headerName of [
    "user-agent",
    "x-forwarded-for",
    "x-real-ip",
    "x-request-id",
  ]) {
    const headerValue = incomingHeaders.get(headerName);
    if (headerValue) {
      forwardedHeaders.set(headerName, headerValue);
    }
  }

  return forwardedHeaders;
}

function buildRequestHeaders(
  requestHeaders: Headers,
  hasBody: boolean
): Headers {
  if (!hasBody) return requestHeaders;

  return new Headers({
    ...Object.fromEntries(requestHeaders.entries()),
    "content-type": "application/json",
  });
}

async function readErrorDetail(
  response: Response,
  fallbackMessage: string
): Promise<string> {
  const clonedResponse = response.clone();
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.json()) as AuthApiErrorPayload;
      if (typeof payload.detail === "string" && payload.detail.trim()) {
        return payload.detail;
      }
    } catch {
      // Fall back to raw text below.
    }
  }

  const detail = await clonedResponse.text();
  return detail || fallbackMessage;
}

export async function authApiFetch<T>(
  config: AuthConfig,
  path: string,
  init: Omit<RequestInit, "body" | "headers"> & { body?: unknown } = {}
): Promise<T> {
  const requestHeaders = await getForwardHeaders();
  const hasBody = init.body !== undefined;
  const response = await fetch(
    `${config.authApiBaseUrl}${config.authApiPrefix}${path}`,
    {
      ...init,
      body: hasBody ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      headers: buildRequestHeaders(requestHeaders, hasBody),
    }
  );

  if (!response.ok) {
    const fallbackMessage = `Auth request failed (${response.status})`;
    const detail = await readErrorDetail(response, fallbackMessage);
    throw new AuthApiError(response.status, detail);
  }

  return (await response.json()) as T;
}
