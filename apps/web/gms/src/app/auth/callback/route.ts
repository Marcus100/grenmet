import { completeAppSignIn } from "@barrelsgd/auth/server";
import { type NextRequest, NextResponse } from "next/server";
import { authConfig } from "@/lib/auth-config";
import { env } from "@/lib/env";

/** Single sign-on (ADR-0017): redeem auth's one-use code for this site. */
export function GET(request: NextRequest) {
  if (!env.WEATHER_SSO_CLIENT_SECRET) {
    return new NextResponse("Not found", { status: 404 });
  }
  return completeAppSignIn(authConfig, request, {
    clientSecret: env.WEATHER_SSO_CLIENT_SECRET,
    notice: true,
  });
}
