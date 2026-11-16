import { useEffect, useRef } from "react";
import type { Tone, Verdict } from "@/lib/scan-outcome";

/*
 * Colour carries the meaning. Admitted is green with ink text (5.1:1). Refused
 * is dark red with paper text (5.95:1, so normal text passes AA). Any answer
 * that is not a yes, or not an answer, is neutral and says so in words.
 */
const TONE_CLASS: Record<Tone, string> = {
  admitted: "bg-px-valid text-px-ink",
  refused: "bg-px-stop text-px-paper",
  unchecked: "bg-px-surface text-px-paper border-8 border-px-rule",
  pairing: "bg-px-surface text-px-paper border-8 border-px-rule",
};

const BUTTON_CLASS: Record<Tone, string> = {
  admitted: "bg-px-ink text-px-paper",
  refused: "bg-px-paper text-px-ink",
  unchecked: "bg-px-green text-px-ink",
  pairing: "bg-px-green text-px-ink",
};

interface ResultOverlayProps {
  readonly onDismiss: () => void;
  readonly verdict: Verdict;
}

/**
 * The full-screen answer. An admitted ticket clears itself; every other answer
 * stays until someone taps Scan next, so staff can read it.
 */
export function ResultOverlay({ verdict, onDismiss }: ResultOverlayProps) {
  const next = useRef<HTMLButtonElement>(null);
  const waits = verdict.autoDismissMs === null;

  useEffect(() => {
    if (waits) {
      next.current?.focus();
    }
  }, [waits]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col justify-between gap-8 px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] ${TONE_CLASS[verdict.tone]}`}
      role={verdict.tone === "admitted" ? "status" : "alert"}
    >
      <div className="flex flex-col gap-4">
        <h2 className="text-5xl leading-tight font-bold">{verdict.title}</h2>
        <p className="text-2xl leading-snug font-bold">{verdict.detail}</p>
      </div>
      {waits ? (
        <button
          className={`focus-visible:outline-px-paper min-h-16 w-full rounded-2xl text-xl font-bold transition-transform duration-150 ease-out hover:opacity-90 focus-visible:outline-4 focus-visible:outline-offset-4 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${BUTTON_CLASS[verdict.tone]}`}
          onClick={onDismiss}
          ref={next}
          type="button"
        >
          Scan next
        </button>
      ) : null}
    </div>
  );
}
