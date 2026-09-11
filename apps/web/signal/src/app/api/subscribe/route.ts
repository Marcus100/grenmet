import { NextResponse } from "next/server";

// Keep direct callers honest while subscription storage is not available.
export function POST(_request: Request) {
  return NextResponse.json(
    { error: "Subscriptions are not open yet. No details have been saved." },
    { status: 503 }
  );
}
