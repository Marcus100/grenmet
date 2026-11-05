import { isAuthApiError } from "@barrelsgd/auth";
import type { NextRequest } from "next/server";
import { exportStatisticsCsv } from "@/lib/desk/api";
import { getDeskGate } from "@/lib/desk/gate";
import { parseStatisticsQuery } from "@/lib/desk/statistics-query";
import { reportError } from "@/lib/report-error";

/**
 * The statistics CSV download. Validate and proxy only (AGENTS.md): the
 * filters are checked here, FastAPI counts and checks `cap.alert.read`, and the
 * file streams back with the forecaster's token added on the server.
 */
export const dynamic = "force-dynamic";

const NO_STORE = "private, no-store";
const FALLBACK_NAME = "cap-warning-statistics.csv";

function refuse(status: number, detail: string): Response {
  return new Response(detail, {
    headers: {
      "Cache-Control": NO_STORE,
      "Content-Type": "text/plain; charset=utf-8",
    },
    status,
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  const gate = await getDeskGate();
  if (gate.status === "signed-out") {
    return refuse(401, "Sign in to the warning desk.");
  }
  if (gate.status === "refused" || !gate.permissions.read) {
    return refuse(403, "This account does not hold cap.alert.read.");
  }
  const params: Record<string, string | string[]> = {};
  for (const name of new Set(request.nextUrl.searchParams.keys())) {
    const values = request.nextUrl.searchParams.getAll(name);
    params[name] = values.length === 1 ? (values[0] ?? "") : values;
  }
  const query = parseStatisticsQuery(params);
  if (!query.ok) return refuse(422, query.problems.join(" "));

  try {
    const upstream = await exportStatisticsCsv(gate.accessToken, {
      end: query.end,
      hazard: query.hazard,
      start: query.start,
    });
    return new Response(upstream.body, {
      headers: {
        "Cache-Control": NO_STORE,
        "Content-Disposition":
          upstream.headers.get("content-disposition") ??
          `attachment; filename="${FALLBACK_NAME}"`,
        "Content-Type": "text/csv; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (isAuthApiError(error) && [401, 403, 422].includes(error.status)) {
      return refuse(error.status, error.message);
    }
    reportError(error, "cap-desk-statistics-export");
    return refuse(502, "The warning service did not answer.");
  }
}
