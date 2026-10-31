import { completeAppSignIn } from "@barrelsgd/auth/server";
import { type NextRequest, NextResponse } from "next/server";
import { getAuthConfig } from "@/lib/desk/auth-config";
import { env } from "@/lib/env";

/** Redeem auth's one-use code for a warning-desk session (host-only cookie). */
export function GET(request: NextRequest) {
  if (!env.CAP_SSO_CLIENT_SECRET) {
    return new NextResponse("Single sign-on is not configured", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  return completeAppSignIn(getAuthConfig(), request, {
    clientSecret: env.CAP_SSO_CLIENT_SECRET,
    failurePath: "/desk/signin",
  });
}
