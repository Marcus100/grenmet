import { ResponseError, subscriptionsSubscribe } from "@barrelsgd/api-client";
import { NextResponse } from "next/server";
import {
  NEWSLETTER_LIST_KEY,
  parseNewsletterSignup,
} from "@/lib/newsletter-signup";
import { redactRequest } from "@/lib/redact-request";
import { visitorClient } from "@/lib/visitor-client";

/**
 * Daily climate newsletter sign-up. Validates the body and forwards it, with the
 * Turnstile token, to FastAPI. FastAPI owns storage, double opt-in, suppression
 * and rate limits, and answers the same for every address, so this reply never
 * reveals whether an address already exists.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = parseNewsletterSignup(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  try {
    await subscriptionsSubscribe({
      client: await visitorClient(),
      body: {
        list_key: NEWSLETTER_LIST_KEY,
        email: parsed.data.email,
        turnstile_token: parsed.data.turnstileToken,
      },
    })
      .unwrap()
      .catch(redactRequest);
    return NextResponse.json(
      {
        ok: true,
        message:
          "Check your email to confirm. Nothing is sent until you click the link.",
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof ResponseError && error.status === 400) {
      return NextResponse.json(
        { error: "Verification failed. Please try again." },
        { status: 400 }
      );
    }
    if (error instanceof ResponseError && error.status === 422) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }
    if (error instanceof ResponseError && error.status === 429) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again in a minute." },
        { status: 429 }
      );
    }
    // Anything else is unexpected: let error handling report it.
    throw error;
  }
}
