import { completeAppSignIn } from "@barrelsgd/auth/server";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { getAuthConfig } from "@/lib/auth-config";

/** Single sign-on (ADR-0017): redeem auth's one-use code for a Bookings session. */
export function GET(request: NextRequest) {
  if (!env.BOOKINGS_SSO_CLIENT_SECRET) {
    return new NextResponse("Single sign-on is not configured", {
      status: 503,
    });
  }
  return completeAppSignIn(getAuthConfig(), request, {
    clientSecret: env.BOOKINGS_SSO_CLIENT_SECRET,
    failurePath: "/signin",
  });
}
