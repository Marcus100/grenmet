import { messageSchema } from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { APP_AUTH_PATH, authConfig } from "@/lib/auth-config";
import { authErrorResponse } from "@/lib/auth-errors";
import { reportError } from "@/lib/report-error";

const bodySchema = z.object({
  email: z.string().email().max(254),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { detail: "Enter a valid email." },
      { status: 400 }
    );
  }
  try {
    const message = await authApiFetch(
      authConfig,
      `${APP_AUTH_PATH}/email-code/start`,
      messageSchema,
      {
        body: {
          email: parsed.data.email,
          first_name: parsed.data.firstName,
          last_name: parsed.data.lastName,
        },
        method: "POST",
      }
    );
    return NextResponse.json(message);
  } catch (error) {
    return authErrorResponse(error, reportError);
  }
}
