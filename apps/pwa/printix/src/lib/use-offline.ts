import type { PrintixScanResult } from "@barrelsgd/api-client";
import { printixScanOutcome } from "@barrelsgd/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { decideOffline } from "@/lib/offline-check";
import { createBarcodeHasher, pairingTag } from "@/lib/offline-hash";
import {
  type Conflict,
  createOfflineStore,
  type OfflineSnapshot,
  type OfflineStore,
} from "@/lib/offline-store";
import { refreshList, type SyncResult, syncQueue } from "@/lib/offline-sync";
import { reportError } from "@/lib/report-error";
import {
  type Connection,
  type Failure,
  type PairingProblem,
  readOfflineList,
  sendOfflineAdmissions,
} from "@/lib/scan-api";
import type { Source, Verdict } from "@/lib/scan-outcome";

/** A fresh list every five minutes while online. */
const LIST_REFRESH_MS = 5 * 60 * 1000;
/** The server allows four list downloads a minute; stay well under it. */
const LIST_MIN_GAP_MS = 30 * 1000;
/** Queued admissions are sent this often while there is signal. */
const SYNC_INTERVAL_MS = 15 * 1000;
/** The server allows twelve syncs a minute; never send closer than this. */
const SYNC_MIN_GAP_MS = 6 * 1000;

/**
 * ready: a list is saved and offline checks work. no-list: nothing saved yet.
 * unavailable: the server refuses offline mode for this event. no-storage: the
 * phone would not keep data (private browsing, storage full).
 */
export type OfflineMode =
  | "starting"
  | "ready"
  | "no-list"
  | "unavailable"
  | "no-storage";

export interface OfflineView {
  /**
   * Checks a value against the saved list. Null when there is no usable list,
   * so the caller shows the plain no-signal answer.
   */
  readonly checkOffline: (
    value: string,
    source: Source
  ) => Promise<Verdict | null>;
  /** Forgets the conflicts once staff have read them. */
  readonly clearConflicts: () => void;
  readonly conflicts: readonly Conflict[];
  /** The event named in the saved list, for when the live count is out of reach. */
  readonly eventName: string | null;
  /** When the saved list was downloaded; null when there is none. */
  readonly fetchedAt: string | null;
  /** Forgets everything saved and stops saving, for unpairing. */
  readonly forget: () => Promise<void>;
  /**
   * Admissions made under an earlier pairing that were removed unsent. They
   * cannot be sent with this pairing; staff must be told.
   */
  readonly lost: number;
  /** Tells the hook what a live check just learnt about the signal. */
  readonly markOnline: (online: boolean) => void;
  readonly mode: OfflineMode;
  readonly online: boolean;
  /** Admissions made offline that still have to be sent. */
  readonly pending: number;
  /** Notes a live answer, so the saved list knows a ticket just went in. */
  readonly recordLive: (value: string, result: PrintixScanResult) => void;
}

interface Options {
  readonly makeStore?: () => OfflineStore;
  readonly now?: () => Date;
}

function startsOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** How long to wait after a failed request; null when the pairing is the problem. */
function waitAfter(failure: Failure, fallback: number): number | null {
  if (failure.kind === "pairing") {
    return null;
  }
  if (failure.kind === "rate-limited") {
    return failure.retryAfterSeconds * 1000;
  }
  return fallback;
}

/** The wait before the next send, from what the last one returned. */
function syncDelay(result: SyncResult): number {
  if (result.kind === "offline-unavailable") {
    return SYNC_INTERVAL_MS;
  }
  if (result.kind !== "ok") {
    return waitAfter(result, SYNC_INTERVAL_MS) ?? SYNC_INTERVAL_MS;
  }
  if (result.retryAfterMs) {
    return result.retryAfterMs;
  }
  return result.snapshot.pending > 0 ? SYNC_MIN_GAP_MS : SYNC_INTERVAL_MS;
}

/**
 * Offline checking for one pairing: keeps the event's ticket list on the
 * phone, checks tickets from it with no signal, queues those admissions and
 * sends them when the signal is back. Never lets anyone in from an empty or
 * refused list: the caller then shows the plain no-signal answer.
 */
export function useOffline(
  connection: Connection | null,
  onPairingProblem: (problem: PairingProblem) => void,
  options: Options = {}
): OfflineView {
  const { makeStore = createOfflineStore, now = () => new Date() } = options;
  const [mode, setMode] = useState<OfflineMode>("starting");
  const [online, setOnline] = useState(startsOnline);
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null);
  const [lost, setLost] = useState(0);
  const store = useRef<OfflineStore | null>(null);
  const tag = useRef<string | null>(null);
  const stopped = useRef(false);
  const hasher = useRef<{
    key: string;
    hash: (value: string) => Promise<string>;
  } | null>(null);
  const kick = useRef<{ list: () => void; sync: () => void }>({
    list: () => undefined,
    sync: () => undefined,
  });
  const problemRef = useRef(onPairingProblem);
  const nowRef = useRef(now);
  const onlineRef = useRef(online);

  useEffect(() => {
    problemRef.current = onPairingProblem;
    nowRef.current = now;
  });

  useEffect(() => {
    if (!connection) {
      return;
    }
    let active = true;
    let listTimer: ReturnType<typeof setTimeout> | undefined;
    let syncTimer: ReturnType<typeof setTimeout> | undefined;
    let lastListAt = 0;
    let lastSyncAt = 0;
    // Only a wait the server asked for (deferred, or rate-limited).
    let serverWaitUntil = 0;
    let refusing = false;
    let sendOne = false;
    // One job at a time: a list saved while a send is settling could
    // otherwise mark a just-sent ticket valid again.
    let chain: Promise<unknown> = Promise.resolve();
    const serial = (job: () => Promise<void>) => {
      chain = chain.then(job, job);
      return chain;
    };
    const wanted = () => active && !stopped.current;

    const show = (next: OfflineSnapshot) => {
      if (!wanted()) {
        return;
      }
      setSnapshot(next);
      if (!refusing) {
        setMode(next.meta ? "ready" : "no-list");
      }
    };

    const noteFailure = (failure: Failure) => {
      if (failure.kind === "pairing") {
        problemRef.current(failure.problem);
      } else if (failure.kind === "no-signal") {
        setOnline(false);
      }
    };

    const scheduleList = (delay: number) => {
      clearTimeout(listTimer);
      listTimer = setTimeout(() => kick.current.list(), delay);
    };

    const scheduleSync = (at: number) => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(
        () => kick.current.sync(),
        Math.max(0, at - Date.now())
      );
    };

    const runList = async () => {
      const current = store.current;
      if (!(wanted() && current && tag.current)) {
        return;
      }
      const elapsed = Date.now() - lastListAt;
      if (elapsed < LIST_MIN_GAP_MS) {
        scheduleList(LIST_MIN_GAP_MS - elapsed);
        return;
      }
      lastListAt = Date.now();
      let delay: number | null = LIST_REFRESH_MS;
      try {
        const result = await refreshList(
          current,
          () => readOfflineList(connection),
          tag.current,
          nowRef.current,
          wanted
        );
        if (result.kind === "ok") {
          refusing = false;
          setOnline(true);
          show(result.snapshot);
        } else if (result.kind === "offline-unavailable") {
          refusing = true;
          setOnline(true);
          setMode("unavailable");
        } else if (result.kind !== "skipped") {
          noteFailure(result);
          delay = waitAfter(result, LIST_REFRESH_MS);
        }
      } catch (error) {
        reportError(error, "offline-list");
      }
      if (delay !== null && wanted()) {
        scheduleList(delay);
      }
    };

    const runSync = async () => {
      const current = store.current;
      if (!(wanted() && current)) {
        return;
      }
      lastSyncAt = Date.now();
      let delay = SYNC_INTERVAL_MS;
      try {
        const result = await syncQueue(
          current,
          (admissions) => sendOfflineAdmissions(connection, admissions),
          { now: nowRef.current, one: sendOne }
        );
        if (result.kind === "ok") {
          sendOne = false;
          show(result.snapshot);
        } else if (result.kind === "rejected") {
          // The server refused the whole batch: find the entry it refuses.
          sendOne = true;
        } else if (result.kind !== "offline-unavailable") {
          noteFailure(result);
          if (result.kind === "pairing") {
            return;
          }
        }
        delay = syncDelay(result);
        const askedToWait =
          result.kind === "rate-limited" ||
          (result.kind === "ok" && result.retryAfterMs !== null);
        serverWaitUntil = askedToWait ? Date.now() + delay : 0;
      } catch (error) {
        reportError(error, "offline-sync");
      }
      if (wanted()) {
        scheduleSync(Date.now() + Math.max(delay, SYNC_MIN_GAP_MS));
      }
    };

    kick.current = {
      list: () => {
        serial(runList).catch(() => undefined);
      },
      // Sends now if the server's limits allow, otherwise at the earliest
      // moment they do. A retry time the server asked for is kept.
      sync: () => {
        const earliest = Math.max(
          serverWaitUntil,
          lastSyncAt + SYNC_MIN_GAP_MS
        );
        if (Date.now() < earliest) {
          scheduleSync(earliest);
          return;
        }
        clearTimeout(syncTimer);
        serial(runSync).catch(() => undefined);
      },
    };

    const onOnline = () => {
      setOnline(true);
      kick.current.sync();
      kick.current.list();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const start = async () => {
      let opened: OfflineStore | null = null;
      try {
        const fingerprint = await pairingTag(connection.secret);
        if (!active) {
          return;
        }
        opened = makeStore();
        const loaded = await opened.load(fingerprint);
        if (!active) {
          opened.close();
          return;
        }
        store.current = opened;
        tag.current = fingerprint;
        setLost(loaded.lost);
        show(loaded.snapshot);
      } catch (error) {
        opened?.close();
        reportError(error, "offline-storage");
        if (active) {
          setMode("no-storage");
        }
        return;
      }
      kick.current.list();
      kick.current.sync();
    };
    start().catch(() => undefined);

    return () => {
      active = false;
      clearTimeout(listTimer);
      clearTimeout(syncTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      kick.current = { list: () => undefined, sync: () => undefined };
      const closing = store.current;
      store.current = null;
      tag.current = null;
      // Close once queued jobs finish, so none writes to a closed database.
      chain.finally(() => closing?.close()).catch(() => undefined);
    };
  }, [connection, makeStore]);

  const meta = snapshot?.meta ?? null;

  const hashFor = useCallback(
    (value: string): Promise<string> | null => {
      if (!meta) {
        return null;
      }
      if (hasher.current?.key !== meta.hashKey) {
        hasher.current = {
          key: meta.hashKey,
          hash: createBarcodeHasher(meta.hashKey),
        };
      }
      return hasher.current.hash(value);
    },
    [meta]
  );

  const checkOffline = useCallback(
    async (value: string, source: Source): Promise<Verdict | null> => {
      const current = store.current;
      const pairing = tag.current;
      if (!(current && meta && pairing) || mode !== "ready") {
        return null;
      }
      try {
        const hash = await hashFor(value);
        if (hash === null || hash === undefined) {
          return null;
        }
        const at = nowRef.current();
        const ticket = await current.find(hash);
        const decision = decideOffline(ticket, meta, source, at);
        if (decision.kind !== "admit" || !ticket) {
          return decision.verdict;
        }
        const admitted = await current.admit({
          clientRef: crypto.randomUUID(),
          hash,
          pairingTag: pairing,
          printedNumber: ticket.printedNumber,
          scannedAt: at.toISOString(),
          value,
        });
        if (!admitted) {
          // Another read admitted it between the look-up and the write.
          return decideOffline(await current.find(hash), meta, source, at)
            .verdict;
        }
        setSnapshot(await current.snapshot());
        kick.current.sync();
        return decision.verdict;
      } catch (error) {
        reportError(error, "offline-check");
        return null;
      }
    },
    [hashFor, meta, mode]
  );

  const recordLive = useCallback(
    (value: string, result: PrintixScanResult) => {
      const current = store.current;
      const admitted =
        result.outcome === printixScanOutcome.admitted ||
        result.outcome === printixScanOutcome.already_admitted;
      const hashing = admitted ? hashFor(value) : null;
      if (!(current && hashing)) {
        return;
      }
      hashing
        .then((hash) =>
          current.markAdmitted(
            hash,
            result.admitted_at ?? nowRef.current().toISOString(),
            result.admitted_gate ?? null
          )
        )
        .catch((error: unknown) => reportError(error, "offline-live"));
    },
    [hashFor]
  );

  const markOnline = useCallback((next: boolean) => {
    if (next && !onlineRef.current) {
      kick.current.sync();
    }
    onlineRef.current = next;
    setOnline(next);
  }, []);

  const clearConflicts = useCallback(() => {
    store.current
      ?.clearConflicts()
      .then((next) => setSnapshot(next))
      .catch((error: unknown) => reportError(error, "offline-storage"));
  }, []);

  const forget = useCallback(async () => {
    stopped.current = true;
    try {
      await store.current?.clear();
    } catch (error) {
      reportError(error, "offline-storage");
    }
  }, []);

  return {
    checkOffline,
    clearConflicts,
    conflicts: snapshot?.conflicts ?? [],
    eventName: meta?.eventName ?? null,
    fetchedAt: meta?.fetchedAt ?? null,
    forget,
    lost,
    markOnline,
    mode,
    online,
    pending: snapshot?.pending ?? 0,
    recordLive,
  };
}
