import { ResponseError, subscriptionsSubscribe } from "@barrelsgd/api-client";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { parseSubscription } from "@/lib/subscribe";

/** FastAPI mailing list that Signal subscribers join. */
const SIGNAL_LIST_KEY = "signal";

/**
 * Validates the form body and forwards it to FastAPI, which owns storage,
 * double opt-in, suppression and rate limits. The reply never reveals whether
 * an address is already subscribed.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = parseSubscription(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  try {
    const accepted = await subscriptionsSubscribe({
      baseURL: env.AUTH_API_URL,
      body: { list_key: SIGNAL_LIST_KEY, email: parsed.data.email },
    }).unwrap();
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
