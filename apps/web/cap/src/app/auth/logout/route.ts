import {
  clearSessionCookieOnResponse,
  logoutSession,
  readSessionCookie,
} from "@barrelsgd/auth/server";
import { NextResponse } from "next/server";
import { getAuthConfig, getSignedOutUrl } from "@/lib/desk/auth-config";

/** Ends the warning-desk session only; the account and other apps stay signed in. */
export async function POST(): Promise<NextResponse> {
  const config = getAuthConfig();
  const sessionToken = await readSessionCookie(config);
  if (sessionToken) {
    try {
      await logoutSession(config, sessionToken);
    } catch {
      // Clearing the cookie still signs the browser out when the session has
      // already expired or been revoked upstream.
    }
  }
  const response = NextResponse.redirect(getSignedOutUrl(), 303);
  response.headers.set("Cache-Control", "private, no-store");
  clearSessionCookieOnResponse(config, response);
  return response;
}
