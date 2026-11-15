"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CountBar } from "@/components/count-bar";
import { GateScanner } from "@/components/gate-scanner";
import { ResultOverlay } from "@/components/result-overlay";
import { TypedEntry } from "@/components/typed-entry";
import {
  createSoundPlayer,
  holdScreenAwake,
  type SoundPlayer,
  vibrate,
} from "@/lib/gate-feedback";
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
  // Refs, not state, so a read that arrives between two renders is not missed.
  const pending = useRef(false);
  const held = useRef(false);

  useEffect(() => holdScreenAwake(), []);

  const showVerdict = useCallback(
    (next: Verdict) => {
      held.current = true;
      setVerdict(next);
      const time = formatTime(new Date().toISOString());
      setLastCheck(time ? `${next.title}, ${time}` : next.title);
      if (next.sound) {
        sound.play(next.sound);
        vibrate(next.sound);
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
      const answer: ScanAnswer = await submitScan(connection, value);
      pending.current = false;
      setChecking(false);
      if (answer.kind === "pairing") {
        onPairingProblem(answer.problem);
        return;
      }
      if (answer.kind === "checked") {
        refresh();
      }
      showVerdict(verdictFor(answer, source));
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
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-col gap-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <p className="text-px-muted text-xs font-semibold tracking-wider uppercase">
          Paired
        </p>
        <h1 className="truncate text-xl font-semibold">
          {summary?.event.name ?? "Printix Scanner"}
        </h1>
        {summary?.event.status === "closed" ? (
          <p className="text-px-paper text-sm font-semibold">
            This event has closed.
          </p>
        ) : null}
      </header>

      <div className="px-4 pb-4">
        <CountBar link={link} summary={summary} />
      </div>

      <main className="flex flex-1 flex-col gap-4 px-4">
        <GateScanner onRead={handleRead} onStart={() => sound.unlock()} />

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
            <button
              className="bg-px-stop text-px-paper focus-visible:outline-px-paper min-h-14 w-full rounded-2xl text-lg font-bold hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={onUnpair}
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
      {typedOpen ? (
        <TypedEntry
          checking={checking}
          onClose={closeTyped}
          onSubmit={submitTyped}
        />
      ) : null}
    </div>
  );
}
