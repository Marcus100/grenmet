import { completeAppSignIn } from "@barrelsgd/auth/server";
import { type NextRequest, NextResponse } from "next/server";
import { getAuthConfig } from "@/lib/auth-config";
import { env } from "@/lib/env";

/** Single sign-on (ADR-0017): redeem auth's one-use code for an admin session. */
export function GET(request: NextRequest) {
  if (!env.GAA_ADMIN_SSO_CLIENT_SECRET) {
    return new NextResponse("Single sign-on is not configured", {
      status: 503,
    });
  }
  return completeAppSignIn(getAuthConfig(), request, {
    clientSecret: env.GAA_ADMIN_SSO_CLIENT_SECRET,
    failurePath: "/signin",
  });
}
