import { getPayload } from "payload";
import { TOPICS } from "../../../../fields/common";
import { findQuestions, NO_STORE } from "../../../../lib/public-feed";
import { reportError } from "../../../../lib/report-error";
import config from "../../../../payload.config";

export const dynamic = "force-dynamic";

const TOPIC_VALUES = new Set<string>(TOPICS.map((topic) => topic.value));

/** Anonymous, published-only questions; optional `slug` or `topic`. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") ?? undefined;
  const topic = url.searchParams.get("topic") ?? undefined;
  if (topic && !TOPIC_VALUES.has(topic))
    return Response.json(
      { error: "Unknown topic" },
      { status: 400, headers: NO_STORE }
    );
  try {
    const payload = await getPayload({ config });
    const questions = await findQuestions(payload, { slug, topic });
    return Response.json({ questions }, { headers: NO_STORE });
  } catch (error) {
    reportError(error, "cms-public-questions");
    return Response.json(
      { error: "Questions are unavailable" },
      { status: 503, headers: NO_STORE }
    );
  }
}
