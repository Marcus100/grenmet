import {
  clearSessionCookieOnResponse,
  logoutSession,
  readSessionCookie,
} from "@barrelsgd/auth/server";
import { NextResponse } from "next/server";
import { getAuthConfig, getSignedOutUrl } from "@/lib/auth-config";

/** Ends this console's session only; the account and other apps stay signed in. */
export async function POST(): Promise<NextResponse> {
  const config = getAuthConfig();
  const sessionToken = await readSessionCookie(config);

  if (sessionToken) {
    try {
      await logoutSession(config, sessionToken);
    } catch {
      // Clearing the local cookie still signs the browser out when the session
      // has already expired or been revoked upstream.
    }
  }

  const response = NextResponse.redirect(getSignedOutUrl(), 303);
  clearSessionCookieOnResponse(config, response);
  return response;
}
