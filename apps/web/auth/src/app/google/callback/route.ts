import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { googleComplete, modernCookieOptions } from "@/lib/modern-auth";

export async function GET(request: NextRequest) {
  const jar = await cookies();
  const binding = jar.get("google_binding")?.value;
  jar.delete("google_binding");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!(binding && code && state)) {
    return new NextResponse(
      "Google sign-in was cancelled or expired. Start again.",
      { status: 400 }
    );
  }
  try {
    const result = await googleComplete({
      code,
      state,
      browser_binding: createHash("sha256").update(binding).digest("hex"),
    });
    jar.set("google_challenge", result.challenge, modernCookieOptions);
    const destination = new URL("/google/confirm", request.url);
    destination.searchParams.set("mfa", result.requires_totp ? "1" : "0");
    return NextResponse.redirect(destination);
  } catch {
    return new NextResponse(
      "Google sign-in failed. Your account must be activated by an administrator. Try email login or start again.",
      { status: 400 }
    );
  }
}
