import { useEffect, useMemo, useRef, useState } from "react";
import { pairingLink, qrMatrix } from "@/organiser/qr";

/** The secret leaves the screen this long after it is shown, whatever else happens. */
export const HIDE_AFTER_MS = 120_000;

interface GateCodePanelProps {
  readonly expiresLabel: string;
  readonly gate: string;
  readonly onDone: () => void;
  /** Called when the secret must leave the screen: the time is up or the page is hidden. */
  readonly onHide: () => void;
  /** The pairing secret, shown once. It lives only in the caller's state. */
  readonly secret: string;
}

/**
 * The gate code, shown once: a full-width QR code, with words saying what to do
 * now. No copy, download, print or share: the owner decided it stays on screen.
 * The secret is dropped when Done is pressed, after two minutes, or when the page
 * is hidden (the caller clears its state on onHide).
 */
export function GateCodePanel({
  gate,
  secret,
  expiresLabel,
  onDone,
  onHide,
}: GateCodePanelProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [remaining, setRemaining] = useState(HIDE_AFTER_MS / 1000);
  const matrix = useMemo(
    () => qrMatrix(pairingLink(window.location.origin, secret)),
    [secret]
  );
  const quiet = 2;
  const side = matrix.size + quiet * 2;

  // Focus lands on the heading, so a screen reader announces the gate and the warning.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  // The countdown, and the two-minute limit.
  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(() => {
      const left = Math.ceil((HIDE_AFTER_MS - (Date.now() - started)) / 1000);
      if (left <= 0) {
        onHide();
      } else {
        setRemaining(left);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [onHide]);

  // Leaving the page (switching tabs or apps) drops the secret straight away.
  // The page may already be hidden when the code arrives (the tab was switched
  // while the create request was in flight), and no event fires for that, so
  // check on mount as well.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        onHide();
      }
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [onHide]);

  return (
    <section
      aria-labelledby="gate-code-title"
      className="bg-px-surface border-px-green flex flex-col gap-5 rounded-3xl border-2 p-5"
    >
      <div className="flex flex-col gap-2">
        <h3
          className="text-xl font-semibold break-words"
          id="gate-code-title"
          ref={heading}
          tabIndex={-1}
        >
          Gate code for {gate}
        </h3>
        <p className="text-px-green text-base font-semibold">
          Scan this with the gate phone&apos;s camera now. It will not be shown
          again.
        </p>
        <p className="text-px-muted text-sm">Works until {expiresLabel}.</p>
        <p className="text-px-muted text-sm">
          This code hides in {remaining} seconds.
        </p>
      </div>

      <div className="bg-px-paper mx-auto w-full max-w-md rounded-2xl p-4">
        <svg
          aria-label={`QR code for the gate ${gate}`}
          className="block h-auto w-full"
          role="img"
          shapeRendering="crispEdges"
          viewBox={`${-quiet} ${-quiet} ${side} ${side}`}
        >
          <path className="fill-px-ink" d={matrix.path} />
        </svg>
      </div>

      <button
        className="bg-px-surface border-px-rule text-px-paper focus-visible:outline-px-paper hover:bg-px-rule min-h-11 self-start rounded-2xl border px-5 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        onClick={onDone}
        type="button"
      >
        Done
      </button>
    </section>
  );
}
