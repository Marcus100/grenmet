import { completeAppSignIn } from "@barrelsgd/auth/server";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "../../../env";
import { getAuthConfig } from "../../../lib/auth-config";

/** Single sign-on (ADR-0017): redeem auth's one-use code for a CMS session. */
export function GET(request: NextRequest) {
  const secret = getEnv().CMS_SSO_CLIENT_SECRET;
  if (!secret) {
    return new NextResponse("Single sign-on is not configured", {
      status: 503,
    });
  }
  return completeAppSignIn(getAuthConfig(), request, {
    clientSecret: secret,
    failurePath: "/signin",
  });
}
