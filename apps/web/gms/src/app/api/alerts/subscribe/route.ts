import { ResponseError, subscriptionsSubscribe } from "@barrelsgd/api-client";
import { NextResponse } from "next/server";
import { ALERTS_LIST_KEY, parseAlertEmail } from "@/lib/alert-signup";
import { redactRequest } from "@/lib/redact-request";
import { visitorClient } from "@/lib/visitor-client";

/**
 * Email sign-up for published weather alerts. Validates the body and forwards
 * it to FastAPI, which owns storage, double opt-in, suppression and rate
 * limits. The reply never reveals whether an address is already subscribed.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = parseAlertEmail(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  try {
    const accepted = await subscriptionsSubscribe({
      client: await visitorClient(),
      body: { list_key: ALERTS_LIST_KEY, email: parsed.data.email },
    })
      .unwrap()
      .catch(redactRequest);
    return NextResponse.json(
      { ok: true, message: accepted.message },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof ResponseError && error.status === 429) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again in a minute." },
        { status: 429 }
      );
    }
    if (error instanceof ResponseError && error.status === 422) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }
    // Anything else is unexpected: let error handling report it.
    throw error;
  }
}
