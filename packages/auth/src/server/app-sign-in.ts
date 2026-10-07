import "server-only";

import { sessionLoginResponseSchema } from "@barrelsgd/api-client";
import { type NextRequest, NextResponse } from "next/server";
import {
  type AuthConfig,
  isAuthApiError,
  type SessionLoginResponse,
} from "../types";
import { authApiFetch, writeSessionCookieOnResponse } from "./auth-api-fetch";
import { getRequestOrigin, getSafeLocalReturnTo } from "./auth-redirect";

/**
 * Single sign-on through auth.barrels.gd (ADR-0017). Mount `startAppSignIn`
 * at `GET /auth/start` and `completeAppSignIn` at `GET /auth/callback`.
 */

const STATE_MAX_AGE_SECONDS = 10 * 60;
const STATE_BYTES = 24;

function stateCookieName(config: AuthConfig): string {
  return `${config.sessionCookieName}_sso`;
}

function stateCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    // Only the start and callback routes ever need it.
    path: "/auth",
    // Lax: the callback is a top-level navigation back from auth.
    sameSite: "lax" as const,
    // biome-ignore lint/style/noProcessEnv: shared package, no app env.ts available
    secure: process.env.NODE_ENV === "production",
  };
}

function newState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(STATE_BYTES));
  return Buffer.from(bytes).toString("base64url");
}

function readStateCookie(
  config: AuthConfig,
  request: NextRequest
): { state: string; returnTo: string } | null {
  const value = request.cookies.get(stateCookieName(config))?.value ?? "";
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  let returnTo: string | null;
  try {
    returnTo = getSafeLocalReturnTo(decodeURIComponent(value.slice(dot + 1)));
  } catch {
    returnTo = null;
  }
  return { state: value.slice(0, dot), returnTo: returnTo ?? "/" };
}

function finish(
  config: AuthConfig,
  request: NextRequest,
  path: string
): NextResponse {
  const response = NextResponse.redirect(
    new URL(path, getRequestOrigin(request.headers))
  );
  response.cookies.set(stateCookieName(config), "", stateCookieOptions(0));
  // The callback URL carries a one-use code; never leak it onward.
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** Remember where to come back to, then send the browser to auth's /continue. */
export function startAppSignIn(
  config: AuthConfig,
  request: NextRequest
): NextResponse {
  const returnTo =
    getSafeLocalReturnTo(request.nextUrl.searchParams.get("returnTo")) ?? "/";
  const state = newState();
  const target = new URL("/continue", config.authAppUrl);
  target.searchParams.set("app", config.appName);
  target.searchParams.set("state", state);
  const response = NextResponse.redirect(target);
  response.cookies.set(
    stateCookieName(config),
    `${state}.${encodeURIComponent(returnTo)}`,
    stateCookieOptions(STATE_MAX_AGE_SECONDS)
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * Check the state, redeem the one-use code with this app's client secret, set
 * this app's own session cookie and return to where sign-in started. Failures
 * land on `failurePath?sign_in=expired`.
 */
export async function completeAppSignIn(
  config: AuthConfig,
  request: NextRequest,
  input: { clientSecret: string; failurePath?: string }
): Promise<NextResponse> {
  const failure = `${input.failurePath ?? "/"}?sign_in=expired`;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const stored = readStateCookie(config, request);
  if (!(code && state && stored) || stored.state !== state) {
    return finish(config, request, failure);
  }

  let session: SessionLoginResponse;
  try {
    session = await authApiFetch(
      config,
      `/auth/apps/${encodeURIComponent(config.appName)}/handoff/redeem`,
      sessionLoginResponseSchema,
      {
        body: { code, state, client_secret: input.clientSecret },
        method: "POST",
      }
    );
  } catch (error) {
    // Expired, reused or refused codes are expected; an outage is not.
    if (isAuthApiError(error) && error.status < 500) {
      return finish(config, request, failure);
    }
    throw error;
  }

  const response = finish(config, request, stored.returnTo);
  writeSessionCookieOnResponse(
    config,
    response,
    session.session_token,
    session.session_expires_at
  );
  return response;
}
