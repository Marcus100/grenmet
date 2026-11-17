import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GateConsole } from "@/components/gate-console";
import {
  PairingProblemScreen,
  PairingWelcome,
  ScannerNotConnected,
} from "@/components/pairing-screens";
import { env } from "@/env";
import { forgetOfflineData, unsentCount } from "@/lib/offline-store";
import { readPairingFragment } from "@/lib/pairing";
import {
  browserStorage,
  clearPairingSecret,
  loadPairingSecret,
  savePairingSecret,
} from "@/lib/pairing-store";
import { reportError } from "@/lib/report-error";
import type { Connection, PairingProblem } from "@/lib/scan-api";

type Phase =
  | { readonly kind: "loading" }
  | { readonly kind: "unpaired"; readonly badLink: boolean }
  | {
      readonly kind: "paired";
      readonly secret: string;
      readonly saved: boolean;
    }
  | { readonly kind: "problem"; readonly problem: PairingProblem };

/**
 * Removes the pairing from the address bar, so the secret is not left in the
 * history, a screenshot's URL or a bookmark. Replaces the entry; adds none.
 */
function clearFragment(): void {
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}`
  );
}

/**
 * The scanner's top level: reads a pairing link once, keeps the secret on this
 * phone, and shows whichever screen the pairing needs.
 */
export function GateApp() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  // Strict Mode runs effects twice. The fragment must be read exactly once,
  // because the first run clears it from the address bar.
  const started = useRef(false);

  const adoptFragment = useCallback((secret: string) => {
    const saved = savePairingSecret(browserStorage(), secret);
    clearFragment();
    setPhase({ kind: "paired", secret, saved });
  }, []);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    const fragment = readPairingFragment(window.location.hash);
    if (fragment.kind === "paired") {
      adoptFragment(fragment.secret);
      return;
    }
    if (fragment.kind === "invalid") {
      clearFragment();
    }
    const stored = loadPairingSecret(browserStorage());
    setPhase(
      stored
        ? { kind: "paired", secret: stored, saved: true }
        : { kind: "unpaired", badLink: fragment.kind === "invalid" }
    );
  }, [adoptFragment]);

  // A new pairing link opened in this same tab changes only the fragment.
  useEffect(() => {
    const onHash = () => {
      const fragment = readPairingFragment(window.location.hash);
      if (fragment.kind === "paired") {
        adoptFragment(fragment.secret);
      } else if (fragment.kind === "invalid") {
        clearFragment();
        setPhase({ kind: "unpaired", badLink: true });
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [adoptFragment]);

  const handleProblem = useCallback((problem: PairingProblem) => {
    setPhase({ kind: "problem", problem });
  }, []);

  // Every way out of a pairing also deletes what was saved for offline
  // checking: the ticket list and any admissions that were never sent.
  const unpair = useCallback(() => {
    clearPairingSecret(browserStorage());
    setPhase({ kind: "unpaired", badLink: false });
    // After the scanning screen has closed, so nothing it is still finishing
    // can write the list back.
    setTimeout(() => {
      forgetOfflineData().catch((error: unknown) =>
        reportError(error, "offline-storage")
      );
    }, 0);
  }, []);

  // A refused pairing cannot send what it admitted offline; say how many.
  const [unsent, setUnsent] = useState(0);
  const showingProblem = phase.kind === "problem";
  useEffect(() => {
    if (!showingProblem) {
      return;
    }
    let active = true;
    unsentCount()
      .then((count) => {
        if (active) {
          setUnsent(count);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [showingProblem]);

  const secret = phase.kind === "paired" ? phase.secret : null;
  const connection = useMemo<Connection | null>(
    () => (secret === null ? null : { origin: env.VITE_API_URL, secret }),
    [secret]
  );

  if (phase.kind === "loading") {
    return (
      <main className="text-px-muted flex min-h-dvh items-center justify-center p-6 text-base">
        <p>Opening the scanner…</p>
      </main>
    );
  }
  if (phase.kind === "unpaired") {
    return <PairingWelcome badLink={phase.badLink} />;
  }
  if (phase.kind === "problem") {
    return (
      <PairingProblemScreen
        onUnpair={unpair}
        problem={phase.problem}
        unsent={unsent}
      />
    );
  }
  if (!connection) {
    return null;
  }
  if (!connection.origin) {
    return <ScannerNotConnected />;
  }
  return (
    <GateConsole
      connection={connection}
      onPairingProblem={handleProblem}
      onUnpair={unpair}
      storageSaved={phase.saved}
    />
  );
}
