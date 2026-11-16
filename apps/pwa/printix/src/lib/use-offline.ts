import { useCallback, useEffect, useRef, useState } from "react";
import { decideOffline } from "@/lib/offline-check";
import { createBarcodeHasher, pairingTag } from "@/lib/offline-hash";
import {
  type Conflict,
  createOfflineStore,
  type OfflineSnapshot,
  type OfflineStore,
} from "@/lib/offline-store";
import { refreshList, syncQueue } from "@/lib/offline-sync";
import { reportError } from "@/lib/report-error";
import {
  type Connection,
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
  readonly conflicts: readonly Conflict[];
  /** The event named in the saved list, for when the live count is out of reach. */
  readonly eventName: string | null;
  /** When the saved list was downloaded; null when there is none. */
  readonly fetchedAt: string | null;
  /** Forgets everything saved, for unpairing. */
  readonly forget: () => Promise<void>;
  /** Tells the hook what a live check just learnt about the signal. */
  readonly markOnline: (online: boolean) => void;
  readonly mode: OfflineMode;
  readonly online: boolean;
  /** Admissions made offline that still have to be sent. */
  readonly pending: number;
}

interface Options {
  readonly makeStore?: () => OfflineStore;
  readonly now?: () => Date;
}

function startsOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/**
 * Offline checking for one pairing: keeps the event's ticket list on the
 * phone, checks tickets from it with no signal, queues those admissions and
 * sends them when the signal is back. Never let anyone in from an empty or
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
  const store = useRef<OfflineStore | null>(null);
  const tag = useRef<string | null>(null);
  const hasher = useRef<{
    key: string;
    hash: (value: string) => Promise<string>;
  } | null>(null);
  const lastListAt = useRef(0);
  const kick = useRef<{ list: () => void; sync: () => void }>({
    list: () => undefined,
    sync: () => undefined,
  });
  const problemRef = useRef(onPairingProblem);
  const nowRef = useRef(now);

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
    let syncing = false;
    let refusing = false;

    const show = (next: OfflineSnapshot) => {
      if (!active) {
        return;
      }
      setSnapshot(next);
      if (!refusing) {
        setMode(next.meta ? "ready" : "no-list");
      }
    };

    const handleFailure = (
      answer: { kind: string } & Partial<{
        problem: PairingProblem;
        retryAfterSeconds: number;
      }>
    ): number | null => {
      if (answer.kind === "pairing" && answer.problem) {
        problemRef.current(answer.problem);
        return null;
      }
      if (answer.kind === "no-signal") {
        setOnline(false);
      }
      if (answer.kind === "rate-limited" && answer.retryAfterSeconds) {
        return answer.retryAfterSeconds * 1000;
      }
      return 0;
    };

    const runList = async () => {
      const current = store.current;
      if (!(active && current && tag.current)) {
        return;
      }
      const elapsed = Date.now() - lastListAt.current;
      if (elapsed < LIST_MIN_GAP_MS) {
        clearTimeout(listTimer);
        listTimer = setTimeout(runList, LIST_MIN_GAP_MS - elapsed);
        return;
      }
      lastListAt.current = Date.now();
      let delay = LIST_REFRESH_MS;
      try {
        const result = await refreshList(
          current,
          () => readOfflineList(connection),
          tag.current,
          nowRef.current
        );
        if (!active) {
          return;
        }
        if (result.kind === "ok") {
          refusing = false;
          setOnline(true);
          show(result.snapshot);
        } else if (result.kind === "offline-unavailable") {
          refusing = true;
          setOnline(true);
          setMode("unavailable");
        } else {
          const wait = handleFailure(result);
          if (wait === null) {
            return;
          }
          delay = wait > 0 ? wait : LIST_REFRESH_MS;
        }
      } catch (error) {
        reportError(error, "offline-list");
      }
      clearTimeout(listTimer);
      listTimer = setTimeout(runList, delay);
    };

    const runSync = async () => {
      const current = store.current;
      if (!(active && current) || syncing) {
        return;
      }
      syncing = true;
      let delay = SYNC_INTERVAL_MS;
      try {
        const result = await syncQueue(current, (admissions) =>
          sendOfflineAdmissions(connection, admissions)
        );
        if (!active) {
          return;
        }
        if (result.kind === "ok") {
          show(result.snapshot);
          if (result.retryAfterMs) {
            delay = result.retryAfterMs;
          } else if (result.snapshot.pending > 0) {
            delay = 1000;
          }
        } else if (result.kind !== "offline-unavailable") {
          const wait = handleFailure(result);
          if (wait === null) {
            return;
          }
          delay = wait > 0 ? wait : SYNC_INTERVAL_MS;
        }
      } catch (error) {
        reportError(error, "offline-sync");
      } finally {
        syncing = false;
      }
      clearTimeout(syncTimer);
      syncTimer = setTimeout(runSync, delay);
    };

    kick.current = {
      list: () => {
        runList().catch(() => undefined);
      },
      sync: () => {
        clearTimeout(syncTimer);
        runSync().catch(() => undefined);
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
      try {
        tag.current = await pairingTag(connection.secret);
        store.current = makeStore();
        show(await store.current.load(tag.current));
      } catch (error) {
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
    };
  }, [connection, makeStore]);

  const meta = snapshot?.meta ?? null;

  const checkOffline = useCallback(
    async (value: string, source: Source): Promise<Verdict | null> => {
      const current = store.current;
      if (!(current && meta && tag.current) || mode !== "ready") {
        return null;
      }
      try {
        if (hasher.current?.key !== meta.hashKey) {
          hasher.current = {
            key: meta.hashKey,
            hash: createBarcodeHasher(meta.hashKey),
          };
        }
        const hash = await hasher.current.hash(value);
        const ticket = await current.find(hash);
        const decision = decideOffline(ticket, meta, source);
        if (decision.kind === "admit" && ticket) {
          await current.admit({
            clientRef: crypto.randomUUID(),
            hash,
            pairingTag: tag.current,
            printedNumber: ticket.printedNumber,
            scannedAt: nowRef.current().toISOString(),
            value,
          });
          setSnapshot(await current.snapshot());
          kick.current.sync();
        }
        return decision.verdict;
      } catch (error) {
        reportError(error, "offline-check");
        return null;
      }
    },
    [meta, mode]
  );

  const onlineRef = useRef(online);
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  const markOnline = useCallback((next: boolean) => {
    if (next && !onlineRef.current) {
      kick.current.sync();
    }
    onlineRef.current = next;
    setOnline(next);
  }, []);

  const forget = useCallback(async () => {
    try {
      await store.current?.clear();
    } catch (error) {
      reportError(error, "offline-storage");
    }
  }, []);

  return {
    checkOffline,
    conflicts: snapshot?.conflicts ?? [],
    eventName: meta?.eventName ?? null,
    fetchedAt: meta?.fetchedAt ?? null,
    forget,
    markOnline,
    mode,
    online,
    pending: snapshot?.pending ?? 0,
  };
}
