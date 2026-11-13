import { completeAppSignIn } from "@barrelsgd/auth/server";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { getAuthConfig } from "@/lib/auth-config";

/** Single sign-on (ADR-0017): redeem auth's one-use code for an account session. */
export function GET(request: NextRequest) {
  if (!env.ACCOUNT_SSO_CLIENT_SECRET) {
    return new NextResponse("Single sign-on is not configured", {
      status: 503,
    });
  }
  return completeAppSignIn(getAuthConfig(), request, {
    clientSecret: env.ACCOUNT_SSO_CLIENT_SECRET,
    failurePath: "/signin",
  });
}
