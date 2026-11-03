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

/** Fired by `CookieSettingsButton`; the provider opens its settings on it. */
const OPEN_SETTINGS_EVENT = "barrels:cookie-settings";

/**
 * A link-style button that reopens the cookie settings. Every public app puts
 * it in its footer; there is no floating button, which covered content on
 * phones (owner, 29 Oct 2026).
 */
export function CookieSettingsButton({
  children = "Cookie settings",
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      className={className}
      onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}
      type="button"
    >
      {children}
    </button>
  );
}

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
  useEffect(() => {
    // Coming back to change a choice goes straight to the settings.
    const reopen = () => {
      setAnalytics(preference === "accepted");
      setView("customise");
      setOpen(true);
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, reopen);
  }, [preference]);
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
  // Nothing optional can run here, so there is nothing to ask about.
  if (!config) return null;
  const optedOut = browserOptOut();
  // Closed: the footer's CookieSettingsButton reopens the settings.
  if (!open) return null;
  return createPortal(
    <>
      <div aria-hidden="true" className="bg-foreground/40 fixed inset-0 z-50" />
      <section
        aria-label="Cookie preferences"
        aria-modal="true"
        className="bg-background text-foreground shadow-card fixed inset-x-4 top-1/2 z-50 max-h-[calc(100dvh-2rem)] -translate-y-1/2 space-y-5 overflow-y-auto rounded-lg p-6 text-base sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:p-8"
        role="dialog"
      >
        {view === "ask" ? (
          <>
            <h2 className="text-2xl leading-tight font-bold text-balance">
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
            <h2 className="text-2xl leading-tight font-bold text-balance">
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
                  className="accent-primary mt-1 size-5"
                  disabled
                  type="checkbox"
                />
                <span className="font-semibold">Essential cookies</span>
                <span className="text-muted-foreground col-start-2">
                  Needed for the site to work, such as remembering this choice.
                  Always on.
                </span>
              </label>
              <label className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <input
                  checked={analytics}
                  className="accent-primary mt-1 size-5"
                  disabled={optedOut}
                  onChange={(event) => setAnalytics(event.target.checked)}
                  type="checkbox"
                />
                <span className="font-semibold">Analytics cookies</span>
                <span className="text-muted-foreground col-start-2">
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
