import { BarcodeCamera } from "@barrelsgd/pwa-kit/components/barcode-camera";
import {
  createSoundPlayer,
  type SoundPlayer,
  vibrate,
} from "@barrelsgd/pwa-kit/lib/feedback";
import { holdScreenAwake } from "@barrelsgd/pwa-kit/lib/wake-lock";
import { useCallback, useEffect, useRef, useState } from "react";
import { CountBar } from "@/components/count-bar";
import { OfflineStatus } from "@/components/offline-status";
import { ResultOverlay } from "@/components/result-overlay";
import { TypedEntry } from "@/components/typed-entry";
import {
  type Connection,
  type PairingProblem,
  type ScanAnswer,
  submitScan,
} from "@/lib/scan-api";
import { createScanGate } from "@/lib/scan-gate";
import {
  formatTime,
  type Source,
  type Verdict,
  verdictFor,
} from "@/lib/scan-outcome";
import { useLiveCount } from "@/lib/use-live-count";
import { useOffline } from "@/lib/use-offline";

/** The scanner's own words around the shared camera. */
const CAMERA_TEXT = {
  hint: "Hold the ticket's barcode inside the green frame. The camera is used only to read it.",
  insecure:
    "The camera only works on a secure (https) address. Open the scanner from its https link.",
  privacy: "Nothing is sent except the ticket value.",
  region: "Ticket scanner",
  start: "Start scanning",
  video: "Camera view for reading the ticket barcode",
} as const;

/** How long scans skip the live check after one got no answer. */
const LIVE_BACKOFF_MS = 20 * 1000;

interface GateConsoleProps {
  readonly connection: Connection;
  readonly onPairingProblem: (problem: PairingProblem) => void;
  readonly onUnpair: () => void;
  /** False when the phone would not keep the pairing; the screen says so. */
  readonly storageSaved: boolean;
}

/**
 * The scanning screen for a paired phone. It turns camera reads and typed
 * numbers into checks, shows one verdict at a time and keeps the live count.
 * A new read is ignored while a check is pending, while a verdict is on screen
 * and while the typed-number sheet is open.
 */
export function GateConsole({
  connection,
  storageSaved,
  onPairingProblem,
  onUnpair,
}: GateConsoleProps) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [checking, setChecking] = useState(false);
  const [typedOpen, setTypedOpen] = useState(false);
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [sound] = useState<SoundPlayer>(createSoundPlayer);
  const [gate] = useState(createScanGate);
  const { summary, link, refresh } = useLiveCount(connection, onPairingProblem);
  const offline = useOffline(connection, onPairingProblem);
  // The check callback reads the latest offline view without being rebuilt.
  const offlineRef = useRef(offline);
  useEffect(() => {
    offlineRef.current = offline;
  });
  // After a live check gets no answer, the next scans go straight to the saved
  // list for a while, so each guest does not wait out another timeout. The
  // live count's background polling ends the pause once it reaches the server.
  const liveBackoffUntil = useRef(0);
  useEffect(() => {
    if (link === "ok") {
      liveBackoffUntil.current = 0;
      offlineRef.current.markOnline(true);
    }
  }, [link]);
  // Refs, not state, so a read that arrives between two renders is not missed.
  const pending = useRef(false);
  const held = useRef(false);

  useEffect(() => holdScreenAwake(), []);

  const showVerdict = useCallback(
    (next: Verdict) => {
      held.current = true;
      // The sheet may have been opened while this check was pending. Close it
      // for good, so it does not slide back up when the result is dismissed.
      setTypedOpen(false);
      setVerdict(next);
      const time = formatTime(new Date().toISOString());
      setLastCheck(time ? `${next.title}, ${time}` : next.title);
      if (next.sound) {
        const signal = next.sound === "admitted" ? "success" : "failure";
        sound.play(signal);
        vibrate(signal);
      }
    },
    [sound]
  );

  const dismiss = useCallback(() => {
    held.current = false;
    setVerdict(null);
  }, []);

  useEffect(() => {
    if (!verdict || verdict.autoDismissMs === null) {
      return;
    }
    const timer = setTimeout(dismiss, verdict.autoDismissMs);
    return () => clearTimeout(timer);
  }, [verdict, dismiss]);

  const check = useCallback(
    async (value: string, source: Source) => {
      if (pending.current) {
        return;
      }
      pending.current = true;
      setChecking(true);
      const view = offlineRef.current;
      // A phone that knows it has no signal, or just timed out with a saved
      // list to fall back on, skips the wait for another timeout.
      const skipLive =
        (typeof navigator !== "undefined" && navigator.onLine === false) ||
        (view.mode === "ready" && Date.now() < liveBackoffUntil.current);
      const answer: ScanAnswer = skipLive
        ? { kind: "no-signal" }
        : await submitScan(connection, value);
      if (!skipLive && answer.kind === "no-signal") {
        liveBackoffUntil.current = Date.now() + LIVE_BACKOFF_MS;
      }
      view.markOnline(answer.kind !== "no-signal");
      if (answer.kind === "checked") {
        view.recordLive(value, answer.result);
      }
      // With no signal, the saved ticket list decides (null: no usable list).
      const local =
        answer.kind === "no-signal"
          ? await view.checkOffline(value, source)
          : null;
      pending.current = false;
      setChecking(false);
      if (answer.kind === "pairing") {
        onPairingProblem(answer.problem);
        return;
      }
      if (answer.kind === "checked") {
        refresh();
      }
      showVerdict(local ?? verdictFor(answer, source));
    },
    [connection, onPairingProblem, refresh, showVerdict]
  );

  const handleRead = useCallback(
    (value: string) => {
      // Every read refreshes the gate, even one that is not submitted, so a
      // ticket still in view after a verdict is not checked again.
      const fresh = gate.offer(value, Date.now());
      if (!fresh || held.current || pending.current) {
        return;
      }
      check(value, "camera").catch(() => undefined);
    },
    [check, gate]
  );

  const openTyped = () => {
    held.current = true;
    setTypedOpen(true);
  };

  const closeTyped = useCallback(() => {
    held.current = false;
    setTypedOpen(false);
  }, []);

  const submitTyped = (value: string) => {
    if (pending.current) {
      return;
    }
    closeTyped();
    check(value, "typed").catch(() => undefined);
  };

  return (
    <div className="pwa-screen flex min-h-dvh flex-col">
      <header className="flex flex-col gap-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <p className="text-px-muted text-xs font-semibold tracking-wider uppercase">
          Paired
        </p>
        <h1 className="truncate text-xl font-semibold">
          {summary?.event.name ?? offline.eventName ?? "Printix Scanner"}
        </h1>
        {summary?.event.status === "closed" ? (
          <p className="text-px-paper text-sm font-semibold">
            This event has closed.
          </p>
        ) : null}
      </header>

      <div className="flex flex-col gap-4 px-4 pb-4">
        <OfflineStatus
          conflicts={offline.conflicts}
          fetchedAt={offline.fetchedAt}
          lost={offline.lost}
          mode={offline.mode}
          onClearConflicts={offline.clearConflicts}
          online={offline.online}
          pending={offline.pending}
        />
        <CountBar link={link} summary={summary} />
      </div>

      <main className="flex flex-1 flex-col gap-4 px-4">
        <BarcodeCamera
          onRead={handleRead}
          onStart={() => sound.unlock()}
          text={CAMERA_TEXT}
        />

        {checking ? (
          <p
            aria-live="polite"
            className="text-px-paper text-base font-semibold"
            role="status"
          >
            Checking ticket…
          </p>
        ) : null}
        {lastCheck && !checking ? (
          <p className="text-px-muted text-sm">Last check: {lastCheck}</p>
        ) : null}
        {storageSaved ? null : (
          <p className="bg-px-surface text-px-paper rounded-xl px-4 py-3 text-sm">
            This phone could not keep the pairing. If the page reloads, scan the
            pairing code again.
          </p>
        )}
      </main>

      <footer className="mt-auto flex flex-col gap-3 px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          className="bg-px-surface border-px-paper text-px-paper focus-visible:outline-px-green min-h-14 w-full rounded-2xl border text-lg font-semibold transition-transform duration-150 ease-out hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          onClick={openTyped}
          type="button"
        >
          Type a number
        </button>

        {confirmUnpair ? (
          <section
            aria-label="Confirm unpairing"
            className="bg-px-surface flex flex-col gap-3 rounded-2xl p-4"
          >
            <p className="text-base">
              Unpair this phone? It will stop checking tickets until you scan a
              new pairing code.
            </p>
            {offline.pending > 0 ? (
              <p className="text-px-paper text-base font-semibold">
                {offline.pending === 1
                  ? "1 admission made with no signal has not been sent yet and will be lost."
                  : `${offline.pending} admissions made with no signal have not been sent yet and will be lost.`}{" "}
                Unpair only where there is signal and nothing is waiting.
              </p>
            ) : null}
            <button
              className="bg-px-stop text-px-paper focus-visible:outline-px-paper min-h-14 w-full rounded-2xl text-lg font-bold hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => {
                offline
                  .forget()
                  .catch(() => undefined)
                  .finally(onUnpair);
              }}
              type="button"
            >
              Unpair this phone
            </button>
            <button
              className="text-px-paper focus-visible:outline-px-paper min-h-11 w-full rounded-2xl text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => setConfirmUnpair(false)}
              type="button"
            >
              Keep pairing
            </button>
          </section>
        ) : (
          <button
            className="text-px-muted focus-visible:outline-px-paper mx-auto inline-flex min-h-11 items-center text-sm underline focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={() => setConfirmUnpair(true)}
            type="button"
          >
            Unpair this phone
          </button>
        )}
      </footer>

      {verdict ? <ResultOverlay onDismiss={dismiss} verdict={verdict} /> : null}
      {/*
        A result replaces the sheet at once. A sheet still sliding away would
        keep the result hidden from screen readers and block Scan next.
      */}
      {verdict ? null : (
        <TypedEntry
          checking={checking}
          onClose={closeTyped}
          onSubmit={submitTyped}
          open={typedOpen}
        />
      )}
    </div>
  );
}
