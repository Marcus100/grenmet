import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { googleStart, modernCookieOptions } from "@/lib/modern-auth";

export async function GET() {
  const binding = randomBytes(32).toString("hex");
  try {
    const result = await googleStart({
      browser_binding: createHash("sha256").update(binding).digest("hex"),
    });
    (await cookies()).set("google_binding", binding, modernCookieOptions);
    return NextResponse.redirect(result.authorization_url);
  } catch {
    return new NextResponse(
      "Google sign-in is unavailable. Please use email login or contact your administrator.",
      { status: 503 }
    );
  }
}
