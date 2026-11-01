import {
  clearSessionCookieOnResponse,
  logoutSession,
  readSessionCookie,
} from "@barrelsgd/auth/server";
import { NextResponse } from "next/server";
import { getAuthConfig, getSignedOutUrl } from "@/lib/desk/auth-config";
import { isSameOrigin } from "@/lib/desk/request-guards";

/** Ends the warning-desk session only; the account and other apps stay signed in. */
export async function POST(request: Request): Promise<NextResponse> {
  // A page on another *.barrels.gd host must not be able to sign a forecaster out.
  if (!isSameOrigin(request.headers)) {
    return new NextResponse(
      "This request did not come from the warning desk.",
      {
        status: 403,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  }
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
