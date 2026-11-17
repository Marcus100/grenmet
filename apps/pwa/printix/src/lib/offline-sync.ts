import type { PrintixOfflineList } from "@barrelsgd/api-client";
import { printixScanOutcome } from "@barrelsgd/api-client";
import type {
  ListMeta,
  OfflineSnapshot,
  OfflineStore,
  QueuedAdmission,
  Settled,
  StoredTicket,
} from "@/lib/offline-store";
import type {
  Failure,
  OfflineListAnswer,
  OfflineSyncAnswer,
  OfflineUnavailable,
} from "@/lib/scan-api";

/** The server takes at most 100 admissions in one sync. */
const SYNC_BATCH_MAX = 100;

/** The server refuses a scan time before this (ADR-0060). */
const EARLIEST_SCAN = Date.parse("2020-01-01T00:00:00Z");

/** The outcome kept for an admission the server refused to take at all. */
export const REFUSED_OUTCOME = "refused_by_server";

export type OfflineStepResult =
  | { readonly kind: "ok"; readonly snapshot: OfflineSnapshot }
  | { readonly kind: "skipped" }
  | OfflineUnavailable
  | Failure;

export type SyncResult =
  | {
      readonly kind: "ok";
      /** Wait this long before sending again (the server deferred some). */
      readonly retryAfterMs: number | null;
      readonly snapshot: OfflineSnapshot;
    }
  | OfflineUnavailable
  | Failure;

/** The saved form of a freshly downloaded list. */
export function listToStore(
  list: PrintixOfflineList,
  tag: string,
  fetchedAt: string
): { meta: ListMeta; tickets: StoredTicket[] } {
  return {
    meta: {
      closesAt: list.event.closes_at,
      eventId: list.event.id,
      eventName: list.event.name,
      eventStatus: list.event.status,
      fetchedAt,
      generatedAt: list.generated_at,
      hashKey: list.hash_key,
      pairingTag: tag,
    },
    tickets: list.tickets.map((ticket) => ({
      hash: ticket.barcode_hash,
      printedNumber: ticket.printed_number,
      state: ticket.state,
      admittedAt: ticket.admitted_at ?? null,
      admittedGate: ticket.admitted_gate ?? null,
      admittedHere: false,
    })),
  };
}

/**
 * Downloads the ticket list and saves it, keeping this phone's own admissions.
 * `stillWanted` is asked again after the download: a list that arrives after
 * the phone was unpaired is not saved.
 */
export async function refreshList(
  store: OfflineStore,
  download: () => Promise<OfflineListAnswer>,
  tag: string,
  now: () => Date = () => new Date(),
  stillWanted: () => boolean = () => true
): Promise<OfflineStepResult> {
  const answer = await download();
  if (answer.kind !== "list") {
    return answer;
  }
  if (!stillWanted()) {
    return { kind: "skipped" };
  }
  const { meta, tickets } = listToStore(answer.list, tag, now().toISOString());
  return { kind: "ok", snapshot: await store.replaceList(meta, tickets) };
}

/**
 * The phone's scan time, kept inside what the server accepts (2020-01-01 to
 * now). A phone with a wrong clock would otherwise have every batch refused
 * and its queue stuck.
 */
export function sendableTime(scannedAt: string, now: Date): string {
  const time = Date.parse(scannedAt);
  if (Number.isNaN(time) || time < EARLIEST_SCAN || time > now.getTime()) {
    return now.toISOString();
  }
  return scannedAt;
}

function settledFor(
  entry: QueuedAdmission,
  result: {
    readonly admitted_at?: string | null;
    readonly admitted_gate?: string | null;
    readonly outcome: string;
    readonly printed_number?: string | null;
  }
): Settled {
  if (result.outcome === printixScanOutcome.admitted) {
    return { clientRef: entry.clientRef };
  }
  return {
    clientRef: entry.clientRef,
    conflict: {
      clientRef: entry.clientRef,
      outcome: result.outcome,
      printedNumber: result.printed_number ?? entry.printedNumber,
      admittedAt: result.admitted_at ?? null,
      admittedGate: result.admitted_gate ?? null,
      scannedAt: entry.scannedAt,
    },
  };
}

/**
 * Sends the oldest queued admissions once. The server checks each like a live
 * scan and the first admission it records wins: anything but "admitted" is a
 * conflict to show. Admissions the server deferred stay queued.
 *
 * `one` sends only the oldest admission. After the server refused a whole
 * batch, sending one at a time finds the entry it refuses; that one is kept
 * as a conflict and removed, so it cannot block everything behind it.
 */
export async function syncQueue(
  store: OfflineStore,
  send: (
    admissions: { client_ref: string; value: string; scanned_at: string }[]
  ) => Promise<OfflineSyncAnswer>,
  options: { readonly now?: () => Date; readonly one?: boolean } = {}
): Promise<SyncResult> {
  const now = options.now ?? (() => new Date());
  const batch = await store.pending(options.one ? 1 : SYNC_BATCH_MAX);
  if (batch.length === 0) {
    return { kind: "ok", retryAfterMs: null, snapshot: await store.snapshot() };
  }
  const answer = await send(
    batch.map((entry) => ({
      client_ref: entry.clientRef,
      value: entry.value,
      scanned_at: sendableTime(entry.scannedAt, now()),
    }))
  );
  const [oldest] = batch;
  if (answer.kind === "rejected" && batch.length === 1 && oldest) {
    return {
      kind: "ok",
      retryAfterMs: null,
      snapshot: await store.settle([
        settledFor(oldest, { outcome: REFUSED_OUTCOME }),
      ]),
    };
  }
  if (answer.kind !== "synced") {
    return answer;
  }
  const queued = new Map(batch.map((entry) => [entry.clientRef, entry]));
  const settled = answer.result.results.flatMap((result) => {
    const entry = queued.get(result.client_ref);
    return entry ? [settledFor(entry, result)] : [];
  });
  const retry = answer.result.retry_after_seconds;
  return {
    kind: "ok",
    retryAfterMs:
      answer.result.deferred > 0 ? Math.max(1, retry ?? 60) * 1000 : null,
    snapshot: await store.settle(settled),
  };
}
