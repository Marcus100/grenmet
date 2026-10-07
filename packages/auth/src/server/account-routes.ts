import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { type AuthConfig, isAuthApiError } from "../types";
import {
  clearSessionCookieOnResponse,
  readSessionCookie,
} from "./auth-api-fetch";
import { exchangeSessionForAccessToken, logoutSession } from "./session";

/** Set by completeAppSignIn({ notice: true }); read once by the status route. */
export function noticeCookieName(config: AuthConfig): string {
  return `${config.sessionCookieName}_notice`;
}

export interface AccountStatus {
  readonly accountUrl?: string;
  readonly email?: string;
  readonly name?: string;
  /** First page after a single sign-on sign-in: say which account it was. */
  readonly notice?: boolean;
  readonly signedIn: boolean;
}

function json(status: AccountStatus): NextResponse {
  const response = NextResponse.json(status);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * `GET /auth/me` for public sites (ADR-0017): who is signed in, without making
 * every page read cookies. Visitors without a cookie never reach the API.
 */
export async function accountStatusResponse(
  config: AuthConfig,
  request: NextRequest
): Promise<NextResponse> {
  const sessionToken = await readSessionCookie(config);
  if (!sessionToken) return json({ signedIn: false });
  try {
    const { user } = await exchangeSessionForAccessToken(config, sessionToken);
    const response = json({
      signedIn: true,
      name: user.full_name || user.email,
      email: user.email,
      accountUrl: config.authAppUrl,
      notice: request.cookies.has(noticeCookieName(config)),
    });
    response.cookies.delete(noticeCookieName(config));
    return response;
  } catch (error) {
    if (
      isAuthApiError(error) &&
      (error.status === 401 || error.status === 403)
    ) {
      const response = json({ signedIn: false });
      clearSessionCookieOnResponse(config, response);
      return response;
    }
    throw error;
  }
}

/** `POST /auth/logout`: end this site's session only. */
export async function signOutResponse(
  config: AuthConfig,
  request: NextRequest
): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const sessionToken = await readSessionCookie(config);
  if (sessionToken) {
    try {
      await logoutSession(config, sessionToken);
    } catch (error) {
      // The cookie is cleared regardless; a revoked or expired session is fine.
      if (!isAuthApiError(error)) throw error;
    }
  }
  const response = NextResponse.json({ ok: true });
  clearSessionCookieOnResponse(config, response);
  return response;
}
