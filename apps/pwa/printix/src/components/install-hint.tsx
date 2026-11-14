"use client";

import { useEffect, useState } from "react";
import { type InstallAdvice, installAdvice, isIos } from "@/lib/install";

/** Chrome's install event; not in the standard DOM types. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

const STEPS: Record<Exclude<InstallAdvice, "installed" | "prompt">, string> = {
  "ios-steps":
    "On iPhone: open this page in Safari, tap the Share button, then Add to Home Screen.",
  menu: "On Android: open the browser menu, then Install app or Add to Home screen.",
};

/** Tells gate staff how to put the scanner on their home screen. */
export function InstallHint() {
  const [advice, setAdvice] = useState<InstallAdvice | null>(null);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const update = (canPrompt: boolean) =>
      setAdvice(
        installAdvice({
          canPrompt,
          ios: isIos(navigator.userAgent, navigator.maxTouchPoints),
          standalone: isStandalone(),
        })
      );
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
      update(true);
    };
    const onInstalled = () => setAdvice("installed");
    update(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (advice === null || advice === "installed") {
    return null;
  }

  return (
    <aside className="border-px-rule mt-auto flex flex-col gap-3 rounded-2xl border p-4">
      <h2 className="text-sm font-semibold">Install the scanner</h2>
      {advice === "prompt" ? (
        <button
          className="border-px-green text-px-green focus-visible:outline-px-paper self-start rounded-lg border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={() => {
            prompt?.prompt().catch(() => undefined);
          }}
          type="button"
        >
          Install on this phone
        </button>
      ) : (
        <p className="text-px-muted text-sm">{STEPS[advice]}</p>
      )}
    </aside>
  );
}
