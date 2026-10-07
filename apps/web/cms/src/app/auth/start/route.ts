import { startAppSignIn } from "@barrelsgd/auth/server";
import type { NextRequest } from "next/server";
import { getAuthConfig } from "../../../lib/auth-config";

/** Single sign-on (ADR-0017): sign in through auth.barrels.gd. */
export function GET(request: NextRequest) {
  return startAppSignIn(getAuthConfig(), request);
}
