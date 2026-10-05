import { sessionLoginResponseSchema } from "@barrelsgd/api-client";
import { authApiFetch, writeSessionCookie } from "@barrelsgd/auth/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { APP_AUTH_PATH, authConfig } from "@/lib/auth-config";
import { authErrorResponse } from "@/lib/auth-errors";
import { reportError } from "@/lib/report-error";

const bodySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  email: z.string().email().max(254),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { detail: "Enter the 6-digit code." },
      { status: 400 }
    );
  }
  try {
    const login = await authApiFetch(
      authConfig,
      `${APP_AUTH_PATH}/email-code/verify`,
      sessionLoginResponseSchema,
      { body: parsed.data, method: "POST" }
    );
    await writeSessionCookie(
      authConfig,
      login.session_token,
      login.session_expires_at
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error, reportError);
  }
}
