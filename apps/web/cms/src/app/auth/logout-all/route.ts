import {
  clearSessionCookieOnResponse,
  logoutAllSessions,
  readSessionCookie,
} from "@barrelsgd/auth/server";
import { NextResponse } from "next/server";
import { getAuthConfig } from "../../../lib/auth-config";
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return new Response("Forbidden", { status: 403 });
  const config = getAuthConfig();
  const token = await readSessionCookie(config);
  if (token) {
    try {
      await logoutAllSessions(config, token);
    } catch {
      /* Clear expired or revoked local sessions too. */
    }
  }
  // Not back to /signin: the live account session would sign this browser
  // straight in again (ADR-0017), so auth explains and offers the choice.
  const response = NextResponse.redirect(
    new URL("/signed-out?all=1", config.authAppUrl),
    303
  );
  clearSessionCookieOnResponse(config, response);
  return response;
}
