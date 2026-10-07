import { completeAppSignIn } from "@barrelsgd/auth/server";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { authConfig } from "@/lib/auth-config";

/** Single sign-on (ADR-0017): redeem auth's one-use code for an Events session. */
export function GET(request: NextRequest) {
  if (!env.EVENTS_SSO_CLIENT_SECRET) {
    return new NextResponse("Not found", { status: 404 });
  }
  return completeAppSignIn(authConfig, request, {
    clientSecret: env.EVENTS_SSO_CLIENT_SECRET,
    failurePath: "/sign-in",
  });
}
