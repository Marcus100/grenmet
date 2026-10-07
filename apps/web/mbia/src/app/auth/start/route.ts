import { startAppSignIn } from "@barrelsgd/auth/server";
import type { NextRequest } from "next/server";
import { authConfig } from "@/lib/auth-config";

/** Single sign-on (ADR-0017): sign in with the Barrels account. */
export function GET(request: NextRequest) {
  return startAppSignIn(authConfig, request);
}
