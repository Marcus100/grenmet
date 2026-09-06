import { NextResponse } from "next/server";
import {
  clearSessionCookieOnResponse,
  logoutSession,
  readSessionCookie,
} from "@/lib/server-session";

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
    ? NextResponse.redirect(new URL("/signin", request.url), 303)
    : NextResponse.json({ ok: true });
  clearSessionCookieOnResponse(response);
  return response;
}
