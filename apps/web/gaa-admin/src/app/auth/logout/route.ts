import { getRequestOrigin } from "@barrelsgd/auth/server";
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

  const originHeaders = new Headers(request.headers);
  if (!originHeaders.has("host"))
    originHeaders.set("host", new URL(request.url).host);
  if (!originHeaders.has("x-forwarded-proto"))
    originHeaders.set(
      "x-forwarded-proto",
      new URL(request.url).protocol.slice(0, -1)
    );
  const response = request.headers.get("accept")?.includes("text/html")
    ? NextResponse.redirect(
        new URL("/signin", getRequestOrigin(originHeaders)),
        303
      )
    : NextResponse.json({ ok: true });
  clearSessionCookieOnResponse(response);
  return response;
}
