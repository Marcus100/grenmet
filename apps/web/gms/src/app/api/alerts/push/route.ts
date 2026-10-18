import {
  pushSubscribe,
  pushUnsubscribe,
  pushVapidPublicKey,
  ResponseError,
} from "@barrelsgd/api-client";
import { NextResponse } from "next/server";
import {
  ALERTS_LIST_KEY,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
} from "@/lib/alert-signup";
import { env } from "@/lib/env";

/**
 * Browser notification sign-up for published weather alerts. Validates and
 * proxies to FastAPI, which stores the subscription and sends the pushes.
 */

function failure(error: unknown) {
  if (error instanceof ResponseError) {
    if (error.status === 429) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again in a minute." },
        { status: 429 }
      );
    }
    if (error.status === 503) {
      return NextResponse.json(
        { error: "Browser notifications are not available right now." },
        { status: 503 }
      );
    }
    if (error.status === 422 || error.status === 400) {
      return NextResponse.json(
        { error: "This browser cannot be subscribed." },
        { status: 400 }
      );
    }
  }
  throw error;
}

export async function GET() {
  try {
    const key = await pushVapidPublicKey({
      baseURL: env.AUTH_API_URL,
    }).unwrap();
    return NextResponse.json({
      enabled: key.enabled,
      publicKey: key.public_key ?? null,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = pushSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "This browser cannot be subscribed." },
      { status: 400 }
    );
  }
  try {
    await pushSubscribe({
      baseURL: env.AUTH_API_URL,
      body: { list_key: ALERTS_LIST_KEY, ...parsed.data },
    }).unwrap();
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = pushUnsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  try {
    await pushUnsubscribe({
      baseURL: env.AUTH_API_URL,
      body: { endpoint: parsed.data.endpoint },
    }).unwrap();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
