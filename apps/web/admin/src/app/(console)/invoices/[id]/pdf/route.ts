import { isAuthApiError } from "@barrelsgd/auth";
import { fetchInvoicePdf } from "@/lib/billing-api";
import { parseId } from "@/lib/invoice-form";
import { getStaffGate } from "@/lib/staff-gate";

export const dynamic = "force-dynamic";

// Proxy only: FastAPI renders the PDF and re-checks the caller.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const id = parseId((await params).id);
  if (!id) return new Response("Not found", { status: 404 });
  const gate = await getStaffGate();
  if (gate.status !== "staff") {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const upstream = await fetchInvoicePdf(gate.accessToken, id);
    return new Response(upstream.body, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition":
          upstream.headers.get("content-disposition") ??
          'attachment; filename="invoice.pdf"',
        "content-type": "application/pdf",
      },
    });
  } catch (error) {
    if (isAuthApiError(error) && error.status === 404) {
      return new Response("Not found", { status: 404 });
    }
    if (isAuthApiError(error) && error.status === 401) {
      return new Response("Unauthorized", { status: 401 });
    }
    throw error;
  }
}
