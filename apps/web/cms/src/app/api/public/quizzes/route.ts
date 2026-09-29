import { getPayload } from "payload";
import { findQuizzes, NO_STORE } from "../../../../lib/public-feed";
import { reportError } from "../../../../lib/report-error";
import config from "../../../../payload.config";

export const dynamic = "force-dynamic";

/** Anonymous, published quizzes with their questions; optional `slug`. */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug") ?? undefined;
  try {
    const payload = await getPayload({ config });
    return Response.json(
      { quizzes: await findQuizzes(payload, slug) },
      { headers: NO_STORE }
    );
  } catch (error) {
    reportError(error, "cms-public-quizzes");
    return Response.json(
      { error: "Quizzes are unavailable" },
      { status: 503, headers: NO_STORE }
    );
  }
}
