"use client";

import { useEffect, useState } from "react";
import { type InstallAdvice, installAdvice, isIos } from "../lib/install";

/** Chrome's install event; not in the standard DOM types. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function isStandalone(): boolean {
  // Older browsers and test pages may lack matchMedia; then only iPhone's flag counts.
  const displayMode =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return (
    displayMode || (navigator as { standalone?: boolean }).standalone === true
  );
}

const STEPS: Record<Exclude<InstallAdvice, "installed" | "prompt">, string> = {
  "ios-steps":
    "On iPhone: open this page in Safari, tap the Share button, then Add to Home Screen.",
  menu: "On Android: open the browser menu, then Install app or Add to Home screen.",
};

interface InstallHintProps {
  /** The box's heading, such as "Install the scanner". */
  readonly title: string;
}

/**
 * Tells people how to put the app on their home screen: Chrome's own Install
 * button where it offers one, the steps elsewhere, nothing once installed.
 */
export function InstallHint({ title }: InstallHintProps) {
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
    <aside className="border-pwa-rule mt-auto flex flex-col gap-3 rounded-2xl border p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {advice === "prompt" ? (
        <button
          className="border-pwa-accent text-pwa-accent focus-visible:outline-pwa-text self-start rounded-lg border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={() => {
            prompt?.prompt().catch(() => undefined);
          }}
          type="button"
        >
          Install on this phone
        </button>
      ) : (
        <p className="text-pwa-muted text-sm">{STEPS[advice]}</p>
      )}
    </aside>
  );
}
