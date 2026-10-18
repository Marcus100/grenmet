import {
  contactSendContactMessage,
  ResponseError,
} from "@barrelsgd/api-client";
import { NextResponse } from "next/server";
import { contactSchema } from "@/lib/contact";
import { env } from "@/lib/env";
import { reportError } from "@/lib/report-error";

/**
 * Contact form endpoint. Validates the body and forwards it to FastAPI, which
 * stores the message, rate-limits, and emails it to the GAA inbox.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = contactSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    await contactSendContactMessage({
      baseURL: env.AUTH_API_URL,
      body: {
        site: "mbia",
        name: parsed.data.name,
        email: parsed.data.email,
        subject: parsed.data.subject,
        message: parsed.data.message,
        turnstile_token: parsed.data.turnstileToken,
      },
    }).unwrap();
  } catch (error) {
    if (error instanceof ResponseError && error.status === 400) {
      return NextResponse.json(
        { ok: false, error: "Verification failed. Please try again." },
        { status: 400 }
      );
    }
    if (error instanceof ResponseError && error.status === 429) {
      return NextResponse.json(
        { ok: false, error: "Too many messages. Please try again shortly." },
        { status: 429 }
      );
    }
    reportError(error, "mbia-contact-route");
    return NextResponse.json(
      {
        ok: false,
        error: "We could not send your message. Please try again later.",
      },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
