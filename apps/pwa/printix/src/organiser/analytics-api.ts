// The organiser dashboard's read calls: live analytics, the recent scans and the
// scan list download. Every answer must match the generated schema before a
// screen shows it. The server never sends a barcode; none is read here either.

import {
  type PrintixEventAnalytics,
  type PrintixScanPage,
  printixExportOrgScans,
  printixListOrgScans,
  printixListOrgScansResponseSchema,
  printixOrgEventAnalytics,
  printixOrgEventAnalyticsResponseSchema,
} from "@barrelsgd/api-client";
import { failed, type Outcome } from "@/organiser/errors";
import type { OrganiserSession } from "@/organiser/session";
import { settle } from "@/organiser/write-api";

/** Scans shown under "Recent scans". */
export const RECENT_SCANS = 20;

const REQUEST_TIMEOUT_MS = 20_000;
/** The list is long, so a download gets more time than a read. */
const DOWNLOAD_TIMEOUT_MS = 60_000;

/** Everything the live dashboard shows, from two reads taken together. */
export interface Dashboard {
  readonly analytics: PrintixEventAnalytics;
  readonly scans: PrintixScanPage;
}

function organisationHeader(organisationId: string): Record<string, string> {
  return { "X-Barrels-Organisation": organisationId };
}

export function readAnalytics(
  session: OrganiserSession,
  organisationId: string,
  eventId: string
): Promise<Outcome<PrintixEventAnalytics>> {
  return settle(
    session,
    "organiser-analytics",
    () =>
      printixOrgEventAnalytics({
        path: { event_id: eventId },
        headers: organisationHeader(organisationId),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    printixOrgEventAnalyticsResponseSchema
  );
}

export function readRecentScans(
  session: OrganiserSession,
  organisationId: string,
  eventId: string
): Promise<Outcome<PrintixScanPage>> {
  return settle(
    session,
    "organiser-recent-scans",
    () =>
      printixListOrgScans({
        path: { event_id: eventId },
        query: { page: 1, size: RECENT_SCANS },
        headers: organisationHeader(organisationId),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    printixListOrgScansResponseSchema
  );
}

/** The two live reads at once. The first failure is the one shown. */
export async function readDashboard(
  session: OrganiserSession,
  organisationId: string,
  eventId: string
): Promise<Outcome<Dashboard>> {
  const [analytics, scans] = await Promise.all([
    readAnalytics(session, organisationId, eventId),
    readRecentScans(session, organisationId, eventId),
  ]);
  if (!analytics.ok) {
    return analytics;
  }
  if (!scans.ok) {
    return scans;
  }
  return {
    ok: true,
    value: { analytics: analytics.value, scans: scans.value },
  };
}

const END_LINE = /^# end,(\d+) rows$/u;

/**
 * True when the text is a whole scan list: a header, then rows, then the server's
 * last line "# end,<rows> rows" with the same number of rows. A list cut short by an
 * error on the server has no such line, or counts differently.
 */
export function isCompleteScanList(text: string): boolean {
  const lines = text.split("\r\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  const match = END_LINE.exec(lines.at(-1) ?? "");
  if (!match || lines.length < 2) {
    return false;
  }
  return Number(match[1]) === lines.length - 2;
}

/** The scan list as spreadsheet text (printed numbers only), to save as a file. */
export async function downloadScanList(
  session: OrganiserSession,
  organisationId: string,
  eventId: string
): Promise<Outcome<string>> {
  try {
    const text = await session.call(async () => {
      const response = await printixExportOrgScans({
        path: { event_id: eventId },
        headers: organisationHeader(organisationId),
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      return response.data;
    });
    if (typeof text !== "string") {
      throw new Error("The scan list was not text.");
    }
    if (!isCompleteScanList(text)) {
      return { ok: false, problem: { kind: "download-stopped" } };
    }
    return { ok: true, value: text };
  } catch (error) {
    const outcome = failed<string>(error, "organiser-scan-list");
    if (!outcome.ok && outcome.problem.kind === "too-large") {
      return { ok: false, problem: { kind: "export-too-large" } };
    }
    return outcome;
  }
}
