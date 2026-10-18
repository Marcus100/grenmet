import { feedbackSendPageFeedback, ResponseError } from "@barrelsgd/api-client";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { FEEDBACK_SITE, feedbackSchema } from "@/lib/feedback";
import { reportError } from "@/lib/report-error";

/**
 * Validates the "Was this page helpful?" answer and forwards it to FastAPI,
 * which stores it and rate-limits. No personal data is sent.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  try {
    await feedbackSendPageFeedback({
      baseURL: env.AUTH_API_URL,
      body: {
        site: FEEDBACK_SITE,
        page_path: parsed.data.pagePath,
        helpful: parsed.data.helpful,
        comment: parsed.data.comment || null,
      },
    }).unwrap();
  } catch (error) {
    if (error instanceof ResponseError && error.status === 429) {
      return NextResponse.json(
        { ok: false, error: "Too many answers. Please try again shortly." },
        { status: 429 }
      );
    }
    reportError(error, "docs-feedback-route");
    return NextResponse.json(
      { ok: false, error: "We could not save your feedback." },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
