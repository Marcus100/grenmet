"use client";

import { ArrowRightIcon } from "lucide-react";
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

function PublicAnalytics({
  app,
  privacyHref,
}: {
  app: PublicApp;
  privacyHref?: string;
}) {
  const pathname = usePathname();
  const [preference, setPreference] = useState<"accepted" | "declined" | null>(
    null
  );
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"ask" | "customise">("ask");
  // Analytics starts unticked: turning it on is the reader's choice.
  const [analytics, setAnalytics] = useState(false);
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
        onClick={() => {
          // Coming back to change a choice goes straight to the settings.
          setAnalytics(preference === "accepted");
          setView("customise");
          setOpen(true);
        }}
        type="button"
      >
        Privacy
      </button>,
      document.body
    );
  }
  return createPortal(
    <>
      <div aria-hidden="true" className="fixed inset-0 z-50 bg-foreground/40" />
      <section
        aria-label="Cookie preferences"
        aria-modal="true"
        className="fixed inset-x-4 top-1/2 z-50 max-h-[calc(100dvh-2rem)] -translate-y-1/2 space-y-5 overflow-y-auto rounded-lg bg-background p-6 text-base text-foreground shadow-card sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:p-8"
        role="dialog"
      >
        {view === "ask" ? (
          <>
            <h2 className="text-balance font-bold text-2xl leading-tight">
              Do you accept our cookie policy?
            </h2>
            <p>
              We use essential cookies to run this site and, only if you accept,
              analytics cookies to measure how people use it. No advertising or
              session replay.
            </p>
            {optedOut ? (
              <p>Your browser has turned optional analytics off.</p>
            ) : null}
            <div className="grid gap-2">
              <Button
                className="rounded-full"
                disabled={optedOut}
                onClick={() => choose("accepted")}
                size="touch"
              >
                Accept cookies
                <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
              </Button>
              <Button
                onClick={() => {
                  setAnalytics(false);
                  setView("customise");
                }}
                size="touch"
                variant="link"
              >
                Customise settings
                <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
              </Button>
              <Button
                className="min-h-11"
                onClick={() => choose("declined")}
                variant="link"
              >
                Essential cookies only
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-balance font-bold text-2xl leading-tight">
              Customise your cookie settings
            </h2>
            {privacyHref ? (
              <p>
                Read our{" "}
                <a className="underline underline-offset-4" href={privacyHref}>
                  privacy policy
                </a>{" "}
                for the full details.
              </p>
            ) : null}
            <fieldset className="space-y-4">
              <legend className="sr-only">Cookie categories</legend>
              <label className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <input
                  checked
                  className="mt-1 size-5 accent-primary"
                  disabled
                  type="checkbox"
                />
                <span className="font-semibold">Essential cookies</span>
                <span className="col-start-2 text-muted-foreground">
                  Needed for the site to work, such as remembering this choice.
                  Always on.
                </span>
              </label>
              <label className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <input
                  checked={analytics}
                  className="mt-1 size-5 accent-primary"
                  disabled={optedOut}
                  onChange={(event) => setAnalytics(event.target.checked)}
                  type="checkbox"
                />
                <span className="font-semibold">Analytics cookies</span>
                <span className="col-start-2 text-muted-foreground">
                  Google Analytics and PostHog count visits and a few actions,
                  without advertising or session replay. Your choice is kept for
                  six months.
                </span>
              </label>
            </fieldset>
            {optedOut ? (
              <p>Your browser has turned optional analytics off.</p>
            ) : null}
            <div className="grid gap-2">
              <Button
                className="rounded-full"
                onClick={() => choose(analytics ? "accepted" : "declined")}
                size="touch"
              >
                Confirm cookie settings
                <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
              </Button>
              <Button
                disabled={optedOut}
                onClick={() => choose("accepted")}
                size="touch"
                variant="link"
              >
                Accept all cookies
                <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
              </Button>
            </div>
          </>
        )}
        {preference === null ? null : (
          <button
            className="text-sm underline"
            onClick={() => setOpen(false)}
            type="button"
          >
            Close
          </button>
        )}
      </section>
    </>,
    document.body
  );
}

function AnalyticsForRoute({
  app,
  privacyHref,
}: {
  app: PublicApp;
  privacyHref?: string;
}) {
  const pathname = usePathname();
  return pathname && analyticsAllowedOnPath(app, pathname) ? (
    <PublicAnalytics app={app} privacyHref={privacyHref} />
  ) : null;
}
/** Legacy keys are deliberately ignored; staff mounts never collect browser analytics. */
export function PostHogProvider({
  children,
  app,
  privacyHref,
}: {
  children: React.ReactNode;
  app?: PublicApp;
  /** The app's privacy page, linked from the cookie settings when it has one. */
  privacyHref?: string;
  apiKey?: string;
  apiHost?: string;
}) {
  return (
    <>
      {children}
      {app ? (
        <Suspense fallback={null}>
          <AnalyticsForRoute app={app} privacyHref={privacyHref} />
        </Suspense>
      ) : null}
    </>
  );
}
