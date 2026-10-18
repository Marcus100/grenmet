import { contactSendDataRequest, ResponseError } from "@barrelsgd/api-client";
import { NextResponse } from "next/server";
import { dataRequestSchema } from "@/lib/data-request";
import { env } from "@/lib/env";
import { reportError } from "@/lib/report-error";

/**
 * Climate data request endpoint. Validates the body and forwards it to
 * FastAPI, which stores it, rate-limits, emails the GMS inbox and confirms to
 * the requester.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = dataRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  const data = parsed.data;

  try {
    await contactSendDataRequest({
      baseURL: env.AUTH_API_URL,
      body: {
        name: data.name,
        email: data.email,
        organisation: data.organisation,
        purpose: data.purpose,
        parameters: data.parameters,
        stations: data.stations,
        period_start: data.periodStart,
        period_end: data.periodEnd,
        data_format: data.dataFormat,
        intended_use: data.intendedUse,
        consent: data.consent,
        website: data.website || null,
      },
    }).unwrap();
  } catch (error) {
    if (error instanceof ResponseError && error.status === 429) {
      return NextResponse.json(
        { ok: false, error: "Too many requests. Please try again shortly." },
        { status: 429 }
      );
    }
    reportError(error, "gms-data-request-route");
    return NextResponse.json(
      {
        ok: false,
        error: "We could not send your request. Please try again later.",
      },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
