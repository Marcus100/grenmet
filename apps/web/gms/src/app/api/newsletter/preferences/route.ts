import {
  ResponseError,
  subscriptionsUnsubscribeOneList,
} from "@barrelsgd/api-client";
import { NextResponse } from "next/server";
import { parsePreferencesUnsubscribe } from "@/lib/newsletter-preferences";
import { visitorClient } from "@/lib/visitor-client";

/**
 * Stops one list for the reader behind the emailed token. Validates the body and
 * proxies to FastAPI, which changes only that list and returns what is left. The
 * token is never logged: failures are answered here without rethrowing the
 * request, whose URL or body would carry it.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = parsePreferencesUnsubscribe(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Something is missing. Please use the link in your email again.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await subscriptionsUnsubscribeOneList({
      client: await visitorClient(),
      body: { token: parsed.data.token, list_key: parsed.data.listKey },
    }).unwrap();
    return NextResponse.json({
      lists: result.lists.map((item) => ({
        listKey: item.list_key,
        listName: item.list_name,
      })),
    });
  } catch (error) {
    if (error instanceof ResponseError && error.status === 400) {
      return NextResponse.json(
        { error: "This link is not valid. Use the link in your latest email." },
        { status: 400 }
      );
    }
    // Unexpected: report without the request (it carries the token), then fail.
    throw new Error(
      `newsletter preferences unsubscribe failed (${error instanceof ResponseError ? error.status : "no status"})`
    );
  }
}
