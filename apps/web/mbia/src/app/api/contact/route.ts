import {
  contactSendSiteContactMessage,
  createClient,
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
import { visitorHeaders } from "@/lib/visitor-headers";

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

  // The API rate-limits and checks Turnstile per visitor; this server would
  // otherwise be the only address it sees. The headers are sent only with the
  // shared secret (src/rate_limit.py).
  const visitor = visitorHeaders(
    request.headers,
    env.TRUSTED_WEB_SECRET,
    env.VISITOR_IP_PROXY_HOPS
  );
  const { name, email, subject, message, turnstileToken } = parsed.data;
  try {
    await contactSendSiteContactMessage({
      client: createClient({ baseURL: env.AUTH_API_URL, headers: visitor }),
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
      // The API read the form as invalid although the schema accepted it.
      // A visitor-side problem, so no report.
      if (error.status === 422) {
        return NextResponse.json(
          {
            ok: false,
            error: "Please check your details and try again.",
          },
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
    // Anything else (5xx, including Turnstile misconfiguration as 503, or a
    // network failure) is a fault: report it and tell the visitor.
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
