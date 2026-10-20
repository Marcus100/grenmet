import { isAuthApiError } from "@barrelsgd/auth";
import { parseOrganisationFilter, parsePeriod } from "@/lib/payment-form";
import { fetchReconciliationCsv } from "@/lib/payments-api";
import { getStaffGate } from "@/lib/staff-gate";

export const dynamic = "force-dynamic";

// Proxy only: FastAPI builds the CSV (formula-neutralised cells) and re-checks
// the caller. Nothing is cached.
export async function GET(request: Request): Promise<Response> {
  const gate = await getStaffGate();
  if (gate.status !== "staff") {
    return new Response("Forbidden", { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const period = parsePeriod(
    searchParams.get("start_date") ?? undefined,
    searchParams.get("end_date") ?? undefined
  );
  if (!period.ok) return new Response("Bad request", { status: 400 });
  try {
    const upstream = await fetchReconciliationCsv(gate.accessToken, {
      startDate: period.value.start,
      endDate: period.value.end,
      organisationId: parseOrganisationFilter(
        searchParams.get("organisation_id") ?? undefined
      ),
    });
    return new Response(upstream.body, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition":
          upstream.headers.get("content-disposition") ??
          'attachment; filename="reconciliation.csv"',
        "content-type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    if (isAuthApiError(error) && error.status === 401) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (isAuthApiError(error) && error.status < 500) {
      return new Response("Bad request", { status: 400 });
    }
    throw error;
  }
}
