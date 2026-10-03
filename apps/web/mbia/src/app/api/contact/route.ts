import { NextResponse } from "next/server";
import { contactSchema } from "@/lib/contact";

/**
 * Contact form endpoint. Delivery is deferred — this validates and logs only,
 * mirroring signal's subscribe seam. Real delivery (email to gaa@gaa.gd or a
 * ticketing system) belongs in a FastAPI endpoint, because backend logic is
 * Python; this route should then only validate and forward to it.
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

  // biome-ignore lint/suspicious/noConsole: log-only stub until real delivery is wired
  console.info("[contact] message received", {
    subject: parsed.data.subject,
    email: parsed.data.email,
  });
  return NextResponse.json({ ok: true });
}
