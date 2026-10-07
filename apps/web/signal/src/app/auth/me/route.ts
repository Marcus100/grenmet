import { accountStatusResponse } from "@barrelsgd/auth/server";
import type { NextRequest } from "next/server";
import { authConfig } from "@/lib/auth-config";

/** Who is signed in, for the header's account button. */
export function GET(request: NextRequest) {
  return accountStatusResponse(authConfig, request);
}
