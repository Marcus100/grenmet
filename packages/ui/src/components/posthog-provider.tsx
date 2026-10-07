"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  analyticsAllowedOnPath,
  browserOptOut,
  CONSENT_KEY,
  CONSENT_MS,
  configForOrigin,
  type PublicApp,
  pageSection,
  readConsent,
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
      setOpen(value === null && configForOrigin(app, location.origin) !== null);
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
    return (
      <button
        aria-label="Privacy settings"
        className="fixed bottom-[calc(var(--privacy-bottom-offset,0px)_+_var(--spacing)_*_4)] left-4 z-50 rounded-full border border-border bg-background px-3 py-1.5 font-medium text-foreground text-xs shadow-card hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => setOpen(true)}
        type="button"
      >
        Privacy
      </button>
    );
  }
  return (
    <section
      aria-describedby="privacy-choice-summary"
      aria-labelledby="privacy-choice-title"
      className="fixed inset-x-4 bottom-[calc(var(--privacy-bottom-offset,0px)_+_var(--spacing)_*_4)] z-50 space-y-3 rounded-lg border border-border bg-background p-4 text-foreground text-sm shadow-card sm:right-auto sm:left-4 sm:max-w-sm"
      role="dialog"
    >
      <h2 className="font-semibold text-base" id="privacy-choice-title">
        Your privacy
      </h2>
      <p id="privacy-choice-summary">
        {optedOut
          ? "Your browser asks sites not to track you, so optional analytics stays off."
          : "May we use optional analytics to see which pages help people? Nothing loads unless you accept, and you can change your mind anytime."}
      </p>
      <details className="text-muted-foreground">
        <summary className="cursor-pointer text-foreground underline">
          What this means
        </summary>
        <div className="space-y-2 pt-2">
          <p>
            Google Analytics and PostHog count page visits and a few actions. No
            session replay, advertising or cross-site tracking.
          </p>
          <p>
            Product events are kept for up to 90 days and Google Analytics data
            for 14 months. Your choice is remembered on this site for six
            months. Basic error and uptime checks run either way.
          </p>
        </div>
      </details>
      {/* Equal weight: declining is as easy as accepting. */}
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => choose("declined")}>Decline</Button>
        <Button disabled={optedOut} onClick={() => choose("accepted")}>
          Accept
        </Button>
      </div>
      {preference === null ? null : (
        <button
          className="text-muted-foreground text-xs underline"
          onClick={() => setOpen(false)}
          type="button"
        >
          Keep my current choice ({preference})
        </button>
      )}
    </section>
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
