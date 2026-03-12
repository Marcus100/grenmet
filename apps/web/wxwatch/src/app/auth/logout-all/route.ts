import { NextResponse } from "next/server";
import {
  clearSessionCookieOnResponse,
  logoutAllSessions,
  readSessionCookie,
} from "@/src/lib/server-session";

export async function POST(): Promise<NextResponse> {
  const sessionToken = await readSessionCookie();

  if (sessionToken) {
    try {
      await logoutAllSessions(sessionToken);
    } catch {
      // Clearing the local cookie still signs the browser out when the session
      // has already expired or been revoked upstream.
    }
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookieOnResponse(response);
  return response;
}
