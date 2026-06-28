import { NextResponse } from "next/server";
import { parseSubscription } from "@/lib/subscribe";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const parsed = parseSubscription(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  // Storage deferred per MVP plan: validate + log, no persistence yet.
  // biome-ignore lint/suspicious/noConsole: log-only stub until a real subscriber store is wired
  console.info("[signal] subscribe", {
    email: parsed.data.email,
    whatsapp: parsed.data.whatsapp ?? null,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
