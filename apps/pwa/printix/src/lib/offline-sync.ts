import type { PrintixOfflineList } from "@barrelsgd/api-client";
import { printixScanOutcome } from "@barrelsgd/api-client";
import type {
  ListMeta,
  OfflineSnapshot,
  OfflineStore,
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

export type OfflineStepResult =
  | { readonly kind: "ok"; readonly snapshot: OfflineSnapshot }
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

/** Downloads the ticket list and saves it, keeping this phone's own admissions. */
export async function refreshList(
  store: OfflineStore,
  download: () => Promise<OfflineListAnswer>,
  tag: string,
  now: () => Date = () => new Date()
): Promise<OfflineStepResult> {
  const answer = await download();
  if (answer.kind !== "list") {
    return answer;
  }
  const { meta, tickets } = listToStore(answer.list, tag, now().toISOString());
  return { kind: "ok", snapshot: await store.replaceList(meta, tickets) };
}

/**
 * Sends the oldest queued admissions once. The server checks each like a live
 * scan and the first admission it records wins: anything but "admitted" is a
 * conflict to show. Admissions the server deferred stay queued.
 */
export async function syncQueue(
  store: OfflineStore,
  send: (
    admissions: { client_ref: string; value: string; scanned_at: string }[]
  ) => Promise<OfflineSyncAnswer>
): Promise<SyncResult> {
  const batch = await store.pending(SYNC_BATCH_MAX);
  if (batch.length === 0) {
    return { kind: "ok", retryAfterMs: null, snapshot: await store.snapshot() };
  }
  const answer = await send(
    batch.map((entry) => ({
      client_ref: entry.clientRef,
      value: entry.value,
      scanned_at: entry.scannedAt,
    }))
  );
  if (answer.kind !== "synced") {
    return answer;
  }
  const queued = new Map(batch.map((entry) => [entry.clientRef, entry]));
  const settled: Settled[] = [];
  for (const result of answer.result.results) {
    const entry = queued.get(result.client_ref);
    if (!entry) {
      continue;
    }
    settled.push(
      result.outcome === printixScanOutcome.admitted
        ? { clientRef: entry.clientRef }
        : {
            clientRef: entry.clientRef,
            conflict: {
              clientRef: entry.clientRef,
              outcome: result.outcome,
              printedNumber: result.printed_number ?? entry.printedNumber,
              admittedAt: result.admitted_at ?? null,
              admittedGate: result.admitted_gate ?? null,
              scannedAt: entry.scannedAt,
            },
          }
    );
  }
  const retry = answer.result.retry_after_seconds;
  return {
    kind: "ok",
    retryAfterMs:
      answer.result.deferred > 0 ? Math.max(1, retry ?? 60) * 1000 : null,
    snapshot: await store.settle(settled),
  };
}
