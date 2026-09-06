import {
  clearSessionCookieOnResponse,
  logoutSession,
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
      await logoutSession(config, token);
    } catch {
      /* Clear expired or revoked local sessions too. */
    }
  }
  const response = NextResponse.redirect(new URL("/signin", request.url), 303);
  clearSessionCookieOnResponse(config, response);
  return response;
}
