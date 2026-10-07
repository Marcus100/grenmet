import { signOutResponse } from "@barrelsgd/auth/server";
import type { NextRequest } from "next/server";
import { authConfig } from "@/lib/auth-config";

/** Sign out of this site only (ADR-0017). */
export function POST(request: NextRequest) {
  return signOutResponse(authConfig, request);
}
