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

/** Starts of the records of a CSV text. A line break inside quotes does not end one. */
function recordStarts(text: string): number[] {
  const starts = [0];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === "\r" && text[index + 1] === "\n") {
      starts.push(index + 2);
      index += 1;
    }
  }
  return starts;
}

/**
 * The scan list without the server's closing line, or null if the list is not whole.
 * Whole means: a header, rows, then the last record "# end,<rows> rows" with the same
 * number of rows, and the text ends after it. A list cut short by an error on the
 * server has no such record, or counts differently. Records are read with the quotes
 * in mind, so a cell holding a line break counts once. The closing line is a check
 * for this screen only: the saved file is plain CSV without it.
 */
export function finishScanList(text: string): string | null {
  if (!text.endsWith("\r\n")) {
    return null;
  }
  const starts = recordStarts(text);
  // The text ends with a line break, so the last start is the empty record after it.
  const records = starts.length - 1;
  const lastStart = starts[records - 1];
  if (lastStart === undefined || records < 2) {
    return null;
  }
  const match = END_LINE.exec(text.slice(lastStart, -2));
  if (!match || Number(match[1]) !== records - 2) {
    return null;
  }
  return text.slice(0, lastStart);
}

/** True when `finishScanList` accepts the text. */
export function isCompleteScanList(text: string): boolean {
  return finishScanList(text) !== null;
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
    const clean = finishScanList(text);
    if (clean === null) {
      return { ok: false, problem: { kind: "download-stopped" } };
    }
    return { ok: true, value: clean };
  } catch (error) {
    const outcome = failed<string>(error, "organiser-scan-list");
    if (!outcome.ok && outcome.problem.kind === "too-large") {
      return { ok: false, problem: { kind: "export-too-large" } };
    }
    return outcome;
  }
}
