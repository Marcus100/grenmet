import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { googleStart, modernCookieOptions } from "@/lib/modern-auth";
import { reportError } from "@/lib/report-error";
import { getSafeReturnTo } from "@/lib/return-to";

export async function GET(request: NextRequest) {
  const binding = randomBytes(32).toString("hex");
  try {
    const result = await googleStart({
      browser_binding: createHash("sha256").update(binding).digest("hex"),
    });
    const jar = await cookies();
    jar.set("google_binding", binding, modernCookieOptions);
    // Same allow-list as password sign-in, e.g. back to /continue for SSO.
    const returnTo = getSafeReturnTo(
      request.nextUrl.searchParams.get("returnTo")
    );
    if (returnTo) jar.set("google_return", returnTo, modernCookieOptions);
    else jar.delete("google_return");
    return NextResponse.redirect(result.authorization_url);
  } catch (error) {
    reportError(error, "auth-google");
    return new NextResponse(
      "Google sign-in is unavailable. Please use email login or contact your administrator.",
      { status: 503 }
    );
  }
}
