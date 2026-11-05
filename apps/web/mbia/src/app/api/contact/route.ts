import {
  contactSendSiteContactMessage,
  ResponseError,
} from "@barrelsgd/api-client";
import { NextResponse } from "next/server";
import {
  CONTACT_SITE_KEY,
  firstContactError,
  parseContact,
} from "@/lib/contact";
import { env } from "@/lib/env";
import { reportError } from "@/lib/report-error";

/**
 * Contact form proxy. Validates the body and forwards it to the per-site
 * FastAPI route; the API stores the message, applies the site's Turnstile
 * policy and emails the site's inbox. No business rules live here.
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

  const parsed = parseContact(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: firstContactError(parsed.error) },
      { status: 400 }
    );
  }

  const { name, email, subject, message, turnstileToken } = parsed.data;
  try {
    await contactSendSiteContactMessage({
      baseURL: env.AUTH_API_URL,
      path: { site_key: CONTACT_SITE_KEY },
      body: {
        name,
        email,
        subject,
        message,
        turnstile_token: turnstileToken,
      },
    }).unwrap();
  } catch (error) {
    if (error instanceof ResponseError) {
      // Turnstile rejected or missing: the API answers 400.
      if (error.status === 400) {
        return NextResponse.json(
          { ok: false, error: "Verification failed. Please try again." },
          { status: 400 }
        );
      }
      // Unknown site or contact switched off: a refusal, not a fault.
      if (error.status === 404) {
        return NextResponse.json(
          {
            ok: false,
            error: "Contact messages are not available right now.",
          },
          { status: 404 }
        );
      }
      if (error.status === 429) {
        return NextResponse.json(
          { ok: false, error: "Too many messages. Please try again shortly." },
          { status: 429 }
        );
      }
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
