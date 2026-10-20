"use client";

import { useEffect, useRef } from "react";

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  remove: (widgetId: string) => void;
  render: (
    container: HTMLElement,
    options: {
      appearance: "interaction-only";
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
      sitekey: string;
    }
  ) => string;
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | undefined;

/** Loads Cloudflare's script once, and only on a page that has the widget. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile) {
        resolve(window.turnstile);
      } else {
        reject(new Error("Turnstile script loaded without an API"));
      }
    };
    script.onerror = () => {
      scriptPromise = undefined;
      reject(new Error("Turnstile script failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface TurnstileProps {
  /** Called with a fresh token, or null when it expires or errors. */
  onToken: (token: string | null) => void;
  /** Change to reset the widget: tokens are single-use. */
  resetKey?: number;
  /** Public site key. Empty: renders nothing and never loads the script. */
  siteKey: string;
}

/** Cloudflare Turnstile, interaction-only. The API verifies the token. */
export function Turnstile({ onToken, resetKey = 0, siteKey }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | undefined>(undefined);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    const container = containerRef.current;
    if (!(siteKey && container)) {
      return;
    }
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled) {
          return;
        }
        widgetRef.current = api.render(container, {
          appearance: "interaction-only",
          callback: (token) => onTokenRef.current(token),
          "error-callback": () => onTokenRef.current(null),
          "expired-callback": () => onTokenRef.current(null),
          sitekey: siteKey,
        });
      })
      .catch(() => onTokenRef.current(null));
    return () => {
      cancelled = true;
      if (widgetRef.current && window.turnstile) {
        window.turnstile.remove(widgetRef.current);
      }
      widgetRef.current = undefined;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey === 0) {
      return;
    }
    if (widgetRef.current && window.turnstile) {
      onTokenRef.current(null);
      window.turnstile.reset(widgetRef.current);
    }
  }, [resetKey]);

  if (!siteKey) {
    return null;
  }
  return <div ref={containerRef} />;
}
