import { completeAppSignIn } from "@barrelsgd/auth/server";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { getAuthConfig } from "@/lib/auth-config";

/** Redeem auth's one-use code for an HR session (host-only cookie). */
export function GET(request: NextRequest) {
  if (!env.HR_SSO_CLIENT_SECRET) {
    return new NextResponse("Single sign-on is not configured", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  return completeAppSignIn(getAuthConfig(), request, {
    clientSecret: env.HR_SSO_CLIENT_SECRET,
    failurePath: "/signin",
  });
}
