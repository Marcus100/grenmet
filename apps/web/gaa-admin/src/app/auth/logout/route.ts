import { NextResponse } from "next/server";
import { getSignedOutUrl } from "@/lib/auth-config";
import {
  clearSessionCookieOnResponse,
  logoutSession,
  readSessionCookie,
} from "@/lib/server-session";

/** Ends this app's session only; the account and other apps stay signed in. */
export async function POST(request: Request): Promise<NextResponse> {
  const sessionToken = await readSessionCookie();

  if (sessionToken) {
    try {
      await logoutSession(sessionToken);
    } catch {
      // Clearing the local cookie still signs the browser out when the session
      // has already expired or been revoked upstream.
    }
  }

  const response = request.headers.get("accept")?.includes("text/html")
    ? NextResponse.redirect(getSignedOutUrl(), 303)
    : NextResponse.json({ ok: true });
  clearSessionCookieOnResponse(response);
  return response;
}
