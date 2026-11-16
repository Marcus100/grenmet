import {
  configureApiClient,
  type PrintixEventSummary,
  type PrintixOfflineAdmission,
  type PrintixOfflineList,
  type PrintixOfflineSyncResult,
  type PrintixScanResult,
  printixAdmitTicket,
  printixEventSummarySchema,
  printixOfflineAdmissions,
  printixOfflineListSchema,
  printixOfflineSyncResultSchema,
  printixOfflineTickets,
  printixPairingSummary,
  printixScanResultSchema,
} from "@barrelsgd/api-client";

/** Why this pairing cannot check tickets: unknown secret, or revoked or expired. */
export type PairingProblem = "not-recognised" | "revoked-or-expired";

/** Every way a call can fail, as the screens need to tell them apart. */
export type Failure =
  | { readonly kind: "pairing"; readonly problem: PairingProblem }
  | { readonly kind: "rate-limited"; readonly retryAfterSeconds: number }
  | { readonly kind: "rejected" }
  | { readonly kind: "no-signal" }
  | { readonly kind: "failed" };

export type ScanAnswer =
  | { readonly kind: "checked"; readonly result: PrintixScanResult }
  | Failure;

export type SummaryAnswer =
  | { readonly kind: "summary"; readonly summary: PrintixEventSummary }
  | Failure;

/** The server refused offline mode for this event (its barcodes are too weak). */
export interface OfflineUnavailable {
  readonly kind: "offline-unavailable";
}

export type OfflineListAnswer =
  | { readonly kind: "list"; readonly list: PrintixOfflineList }
  | OfflineUnavailable
  | Failure;

export type OfflineSyncAnswer =
  | { readonly kind: "synced"; readonly result: PrintixOfflineSyncResult }
  | OfflineUnavailable
  | Failure;

/**
 * How long a live check may take before the phone treats it as no signal and
 * checks the ticket offline instead. A weak signal can otherwise hang a request
 * for much longer than a queue at the gate will wait.
 */
const LIVE_CHECK_TIMEOUT_MS = 5000;

/** Where the API is and which pairing speaks for this phone. */
export interface Connection {
  readonly origin: string;
  readonly secret: string;
}

/** Used when the server gives no usable Retry-After. */
export const DEFAULT_RETRY_SECONDS = 60;
const MAX_RETRY_SECONDS = 3600;

export function parseRetryAfter(value: string | null): number {
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds > 0
    ? Math.min(seconds, MAX_RETRY_SECONDS)
    : DEFAULT_RETRY_SECONDS;
}

/**
 * Maps an HTTP status (null when no answer came back) to a failure. Pure, so
 * every status the scanner routes can return is covered by a test.
 */
export function classifyFailure(
  status: number | null,
  retryAfter: string | null
): Failure {
  if (status === null) {
    return { kind: "no-signal" };
  }
  if (status === 401) {
    return { kind: "pairing", problem: "not-recognised" };
  }
  if (status === 403) {
    return { kind: "pairing", problem: "revoked-or-expired" };
  }
  if (status === 422) {
    return { kind: "rejected" };
  }
  if (status === 429) {
    return {
      kind: "rate-limited",
      retryAfterSeconds: parseRetryAfter(retryAfter),
    };
  }
  return { kind: "failed" };
}

/** The parts of the API client's ResponseError the scanner reads. */
interface HttpError extends Error {
  readonly response: Response;
  readonly status: number;
}

/**
 * Matches the API client's ResponseError by name, as its own
 * `ResponseError.is` does: every generated client carries its own copy of the
 * class, so `instanceof` against one copy can miss an error thrown by another.
 * The class itself is not imported: the client's index exports it twice, and
 * Vite's bundler warns and drops that ambiguous export.
 */
function isHttpError(error: unknown): error is HttpError {
  return (
    error instanceof Error &&
    error.name === "ResponseError" &&
    "status" in error &&
    typeof error.status === "number" &&
    "response" in error &&
    error.response instanceof Response
  );
}

function isOfflineUnavailable(error: HttpError): boolean {
  const data = (error as { data?: unknown }).data;
  return (
    error.status === 409 &&
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    data.code === "offline_not_available"
  );
}

/** A request the phone itself gave up on, such as a timed-out live check. */
function isGivenUp(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

function failureFrom(error: unknown): Failure {
  if (isGivenUp(error)) {
    return { kind: "no-signal" };
  }
  if (isHttpError(error)) {
    return classifyFailure(
      error.status,
      error.response.headers.get("Retry-After")
    );
  }
  // fetch rejects with a TypeError when the network is down or unreachable.
  if (error instanceof TypeError) {
    return { kind: "no-signal" };
  }
  return { kind: "failed" };
}

/**
 * Points the shared client at this pairing. The secret is resolved per request
 * through `getHeaders`, the client's documented path for credentials: the
 * generated operation types do not accept per-call headers. It travels only in
 * the Authorization header, never in a URL.
 */
function connect(connection: Connection): void {
  configureApiClient({
    baseURL: connection.origin,
    getHeaders: () => ({ Authorization: `Bearer ${connection.secret}` }),
  });
}

/**
 * Asks the server about one scanned value (or typed number). Only a 200 whose
 * body matches the generated schema counts as an answer; anything else is a
 * failure, so the phone never invents a verdict.
 */
export async function submitScan(
  connection: Connection,
  value: string
): Promise<ScanAnswer> {
  try {
    connect(connection);
    const { data } = await printixAdmitTicket({
      body: { value },
      signal: AbortSignal.timeout(LIVE_CHECK_TIMEOUT_MS),
    });
    const parsed = printixScanResultSchema.safeParse(data);
    return parsed.success
      ? { kind: "checked", result: parsed.data }
      : { kind: "failed" };
  } catch (error) {
    return failureFrom(error);
  }
}

/** The event and the live counts for this pairing. */
export async function readSummary(
  connection: Connection
): Promise<SummaryAnswer> {
  try {
    connect(connection);
    const { data } = await printixPairingSummary();
    const parsed = printixEventSummarySchema.safeParse(data);
    return parsed.success
      ? { kind: "summary", summary: parsed.data }
      : { kind: "failed" };
  } catch (error) {
    return failureFrom(error);
  }
}

/**
 * The event's ticket list for checking with no signal: keyed hashes, never
 * barcodes. A 409 means the event's barcodes are too weak for offline mode.
 */
export async function readOfflineList(
  connection: Connection
): Promise<OfflineListAnswer> {
  try {
    connect(connection);
    const { data } = await printixOfflineTickets();
    const parsed = printixOfflineListSchema.safeParse(data);
    return parsed.success
      ? { kind: "list", list: parsed.data }
      : { kind: "failed" };
  } catch (error) {
    if (isHttpError(error) && isOfflineUnavailable(error)) {
      return { kind: "offline-unavailable" };
    }
    return failureFrom(error);
  }
}

/** Sends admissions made with no signal. The server's first admission wins. */
export async function sendOfflineAdmissions(
  connection: Connection,
  admissions: readonly PrintixOfflineAdmission[]
): Promise<OfflineSyncAnswer> {
  try {
    connect(connection);
    const { data } = await printixOfflineAdmissions({
      body: { admissions: [...admissions] },
    });
    const parsed = printixOfflineSyncResultSchema.safeParse(data);
    return parsed.success
      ? { kind: "synced", result: parsed.data }
      : { kind: "failed" };
  } catch (error) {
    if (isHttpError(error) && isOfflineUnavailable(error)) {
      return { kind: "offline-unavailable" };
    }
    return failureFrom(error);
  }
}
