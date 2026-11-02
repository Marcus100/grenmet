/** Events per page on the audit screen. */
export const AUDIT_PAGE_SIZE = 25;

/** Whole numbers only: no sign, no decimals, no exponent, no spaces. */
const WHOLE_NUMBER = /^\d{1,7}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type AuditQuery =
  | { alertId: string | null; ok: true; page: number }
  | { ok: false; problems: string[] };

type Params = Record<string, string | string[] | undefined>;

/** `null` for a repeated parameter, which is refused rather than guessed at. */
function single(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return null;
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Reads `page` and `alert_id` from the URL. Both are checked here and only the
 * checked values reach FastAPI. A missing page means page 1; a repeated or
 * malformed one is refused with a plain reason, never silently rounded.
 */
export function parseAuditQuery(params: Params): AuditQuery {
  const problems: string[] = [];
  const rawPage = single(params.page);
  let page = 1;
  if (rawPage === null) {
    problems.push("The page number must be given once.");
  } else if (rawPage !== "") {
    const value = Number(rawPage);
    if (
      !(WHOLE_NUMBER.test(rawPage) && Number.isSafeInteger(value)) ||
      value < 1
    ) {
      problems.push("The page number must be a whole number, 1 or more.");
    } else {
      page = value;
    }
  }
  const rawAlert = single(params.alert_id)?.toLowerCase() ?? null;
  let alertId: string | null = null;
  if (rawAlert === null) {
    problems.push("The alert ID must be given once.");
  } else if (rawAlert !== "") {
    if (UUID.test(rawAlert)) {
      alertId = rawAlert;
    } else {
      problems.push("The alert ID must be a full alert ID (a UUID).");
    }
  }
  if (problems.length > 0) return { ok: false, problems };
  return { alertId, ok: true, page };
}
