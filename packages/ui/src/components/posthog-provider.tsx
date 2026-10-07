"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  analyticsAllowedOnPath,
  browserOptOut,
  CONSENT_KEY,
  CONSENT_MS,
  configForOrigin,
  type PublicApp,
  pageSection,
  readConsent,
  readSavedConsent,
} from "../lib/analytics-policy";
import {
  captureMarkedLink,
  capturePage,
  startAnalytics,
  stopAnalytics,
} from "../lib/analytics-runtime";
import { Button } from "./ui/button";

export { filterAnalyticsEvent } from "../lib/analytics-runtime";

function PublicAnalytics({ app }: { app: PublicApp }) {
  const pathname = usePathname();
  const [preference, setPreference] = useState<"accepted" | "declined" | null>(
    null
  );
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const update = () => {
      const value = readConsent();
      setPreference(value);
      setOpen(
        readSavedConsent() === null &&
          configForOrigin(app, location.origin) !== null
      );
      if (value !== "accepted") stopAnalytics();
      setReady(true);
    };
    update();
    window.addEventListener("storage", update);
    window.addEventListener("focus", update);
    const timer = window.setInterval(update, 60_000);
    return () => {
      stopAnalytics();
      window.removeEventListener("storage", update);
      window.removeEventListener("focus", update);
      window.clearInterval(timer);
    };
  }, [app]);
  useEffect(() => {
    let active = true;
    const config = configForOrigin(app, location.origin);
    if (preference === "accepted" && config)
      startAnalytics(config).then(() => {
        if (!(active && pathname)) return;
        capturePage(pathname, pageSection(pathname));
      });
    return () => {
      active = false;
    };
  }, [app, preference, pathname]);
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest("a[data-analytics-event]")
          : null;
      if (link instanceof HTMLAnchorElement) captureMarkedLink(link);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  function choose(value: "accepted" | "declined") {
    const choice = browserOptOut() ? "declined" : value;
    try {
      localStorage.setItem(
        CONSENT_KEY,
        JSON.stringify({ value: choice, expires: Date.now() + CONSENT_MS })
      );
    } catch {
      /* Fail closed if consent cannot be saved. */
    }
    if (choice !== "accepted") stopAnalytics();
    setPreference(readConsent());
    setOpen(false);
  }
  const config = ready ? configForOrigin(app, location.origin) : null;
  // Apps with a fixed mobile tab bar set --privacy-bottom-offset to sit above it.
  // Nothing optional can run here, so there is nothing to ask about.
  if (!config) return null;
  const optedOut = browserOptOut();
  if (!open) {
    return createPortal(
      <button
        aria-label="Privacy settings"
        className="fixed bottom-[calc(var(--privacy-bottom-offset,0px)_+_var(--spacing)_*_4)] left-4 z-50 rounded-full border border-border bg-background px-3 py-1.5 font-medium text-foreground text-xs shadow-card hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => setOpen(true)}
        type="button"
      >
        Privacy
      </button>,
      document.body
    );
  }
  return createPortal(
    <section
      aria-labelledby="privacy-choice-title"
      className="fixed inset-x-4 bottom-[calc(var(--privacy-bottom-offset,0px)_+_var(--spacing)_*_4)] z-50 space-y-4 rounded-3xl border border-border bg-foreground p-5 text-background text-sm shadow-card sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2"
      role="dialog"
    >
      <h2 className="sr-only" id="privacy-choice-title">
        Cookie preferences
      </h2>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p>We use cookies.</p>
        <details className="group contents">
          <summary className="cursor-pointer list-none underline underline-offset-4">
            Read more
          </summary>
          <div className="w-full space-y-2 pt-2">
            <p>
              Optional analytics helps us improve this site. It starts only if
              you accept. You can change your choice using Privacy.
            </p>
            <p>
              Google Analytics and PostHog count visits and a few actions,
              without advertising or session replay. Your choice is saved on
              this site for six months.
            </p>
          </div>
        </details>
      </div>
      {optedOut ? <p>Your browser has turned optional analytics off.</p> : null}
      <div className="grid grid-cols-2 gap-3">
        <Button
          className="min-h-11 rounded-full bg-background text-foreground hover:bg-background/90"
          disabled={optedOut}
          onClick={() => choose("accepted")}
        >
          Accept
        </Button>
        <Button
          className="min-h-11 rounded-full border border-background/40 bg-transparent text-background hover:bg-background/10"
          onClick={() => choose("declined")}
        >
          Deny
        </Button>
      </div>
      {preference === null ? null : (
        <button
          className="text-xs underline"
          onClick={() => setOpen(false)}
          type="button"
        >
          Close
        </button>
      )}
    </section>,
    document.body
  );
}

function AnalyticsForRoute({ app }: { app: PublicApp }) {
  const pathname = usePathname();
  return pathname && analyticsAllowedOnPath(app, pathname) ? (
    <PublicAnalytics app={app} />
  ) : null;
}
/** Legacy keys are deliberately ignored; staff mounts never collect browser analytics. */
export function PostHogProvider({
  children,
  app,
}: {
  children: React.ReactNode;
  app?: PublicApp;
  apiKey?: string;
  apiHost?: string;
}) {
  return (
    <>
      {children}
      {app ? (
        <Suspense fallback={null}>
          <AnalyticsForRoute app={app} />
        </Suspense>
      ) : null}
    </>
  );
}
