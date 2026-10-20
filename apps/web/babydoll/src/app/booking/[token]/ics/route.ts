import { getBookingIcs } from "@/lib/booking-api";

export const dynamic = "force-dynamic";

// Proxies the API's calendar file so the API address and the token's lookup
// stay on the server. No logic of our own.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await params;
  const text = await getBookingIcs(token);
  if (text === null) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(text, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="babydoll-booking.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
