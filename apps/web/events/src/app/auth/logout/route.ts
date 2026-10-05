import {
  clearSessionCookie,
  logoutSession,
  readSessionCookie,
} from "@barrelsgd/auth/server";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth-config";
import { reportError } from "@/lib/report-error";

export async function POST() {
  const sessionToken = await readSessionCookie(authConfig);
  if (sessionToken) {
    try {
      await logoutSession(authConfig, sessionToken);
    } catch (error) {
      // The cookie is cleared regardless; a stale server session expires itself.
      reportError(error, "events-logout");
    }
  }
  await clearSessionCookie(authConfig);
  return NextResponse.json({ ok: true });
}
