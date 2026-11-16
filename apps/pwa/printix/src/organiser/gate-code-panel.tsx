import { useMemo } from "react";
import { pairingLink, qrMatrix } from "@/organiser/qr";

interface GateCodePanelProps {
  readonly expiresLabel: string;
  readonly gate: string;
  readonly onDone: () => void;
  /** The pairing secret, shown once. It lives only in the caller's state. */
  readonly secret: string;
}

/**
 * The gate code, shown once: a full-width QR code, with words saying what to do
 * now. No copy, download, print or share: the owner decided it stays on screen.
 * The panel's state (and the secret) is dropped when it closes or the screen changes.
 */
export function GateCodePanel({
  gate,
  secret,
  expiresLabel,
  onDone,
}: GateCodePanelProps) {
  const matrix = useMemo(
    () => qrMatrix(pairingLink(window.location.origin, secret)),
    [secret]
  );
  const quiet = 2;
  const side = matrix.size + quiet * 2;

  return (
    <section
      aria-labelledby="gate-code-title"
      className="bg-px-surface border-px-green flex flex-col gap-5 rounded-3xl border-2 p-5"
    >
      <div className="flex flex-col gap-2">
        <h3
          className="text-xl font-semibold break-words"
          id="gate-code-title"
          tabIndex={-1}
        >
          Gate code for {gate}
        </h3>
        <p className="text-px-green text-base font-semibold">
          Scan this with the gate phone&apos;s camera now. It will not be shown
          again.
        </p>
        <p className="text-px-muted text-sm">Works until {expiresLabel}.</p>
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
