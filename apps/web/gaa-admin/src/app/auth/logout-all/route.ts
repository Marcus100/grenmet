import { NextResponse } from "next/server";
import { getSignedOutUrl } from "@/lib/auth-config";
import {
  clearSessionCookieOnResponse,
  logoutAllSessions,
  readSessionCookie,
} from "@/lib/server-session";

/** Ends every session for the account: this app, the others and auth itself. */
export async function POST(request: Request): Promise<NextResponse> {
  const sessionToken = await readSessionCookie();

  if (sessionToken) {
    try {
      await logoutAllSessions(sessionToken);
    } catch {
      // Clearing the local cookie still signs the browser out when the session
      // has already expired or been revoked upstream.
    }
  }

  const response = request.headers.get("accept")?.includes("text/html")
    ? NextResponse.redirect(getSignedOutUrl({ all: true }), 303)
    : NextResponse.json({ ok: true });
  clearSessionCookieOnResponse(response);
  return response;
}
