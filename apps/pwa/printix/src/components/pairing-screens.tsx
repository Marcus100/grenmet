import { InstallHint } from "@barrelsgd/pwa-kit/components/install-hint";
import type { PairingProblem } from "@/lib/scan-api";
import { PAIRING_COPY } from "@/lib/scan-outcome";

const PAGE =
  "pwa-screen flex min-h-dvh flex-col gap-6 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]";
const BUTTON =
  "bg-px-green text-px-ink focus-visible:outline-px-paper min-h-14 hover:opacity-90 w-full rounded-2xl text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] transition-transform duration-150 ease-out motion-reduce:transition-none motion-reduce:active:scale-100";

/** Shown before any pairing: how a phone gets paired. */
export function PairingWelcome({ badLink }: { readonly badLink: boolean }) {
  return (
    <main className={PAGE}>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Printix Scanner
        </h1>
        <p className="text-px-muted text-base">
          Ticket checking for gate staff
        </p>
      </header>

      {badLink ? (
        <p
          className="bg-px-stop text-px-paper rounded-2xl px-4 py-3 text-base font-semibold"
          role="alert"
        >
          This pairing link is not valid. Ask your administrator for a new
          pairing code.
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Pair this phone</h2>
        <p className="text-px-muted text-base">
          Your administrator shows a pairing code for one event and one gate.
          Scan it with this phone&apos;s camera. It opens this page already
          paired.
        </p>
        <p className="text-px-muted text-base">
          Keep the pairing code private. Anyone with it can check tickets at
          that gate until it is revoked.
        </p>
      </section>

      <InstallHint title="Install the scanner" />
    </main>
  );
}

/** The build has no server address, so no ticket can be checked on this phone. */
export function ScannerNotConnected() {
  return (
    <main className={PAGE}>
      <h1 className="text-2xl font-semibold tracking-tight">Printix Scanner</h1>
      <p
        className="bg-px-surface text-px-paper rounded-2xl px-4 py-3 text-base font-semibold"
        role="alert"
      >
        This scanner is not connected to its server, so no ticket can be checked
        on this phone. Ask your administrator to fix the scanner before the gate
        opens.
      </p>
    </main>
  );
}

/** A pairing that the server will not accept: unknown, revoked or expired. */
export function PairingProblemScreen({
  problem,
  onUnpair,
  unsent = 0,
}: {
  readonly problem: PairingProblem;
  readonly onUnpair: () => void;
  /** Admissions made with no signal that were never sent. */
  readonly unsent?: number;
}) {
  const copy = PAIRING_COPY[problem];
  return (
    <main className={PAGE}>
      <section
        aria-labelledby="pairing-problem-title"
        className="bg-px-stop text-px-paper flex flex-col gap-4 rounded-3xl p-6"
        role="alert"
      >
        <h1
          className="text-4xl leading-tight font-bold"
          id="pairing-problem-title"
        >
          {copy.title}
        </h1>
        <p className="text-2xl leading-snug font-bold">{copy.detail}</p>
      </section>
      {unsent > 0 ? (
        <p className="bg-px-surface text-px-paper rounded-2xl px-4 py-3 text-base font-semibold">
          {unsent === 1
            ? "1 admission made with no signal was never sent."
            : `${unsent} admissions made with no signal were never sent.`}{" "}
          Tell your supervisor before you unpair: unpairing deletes them.
        </p>
      ) : null}
      <p className="text-px-muted text-base">
        Unpair this phone, then scan the new pairing code your administrator
        shows.
      </p>
      <button className={BUTTON} onClick={onUnpair} type="button">
        Unpair this phone
      </button>
    </main>
  );
}
