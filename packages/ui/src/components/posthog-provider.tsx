"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
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
  return (
    <div className="border-border border-t bg-background p-4 text-foreground text-sm">
      <button
        className="underline"
        onClick={() => setOpen(!open)}
        type="button"
      >
        Privacy settings
      </button>
      {ready && open ? (
        <section aria-label="Privacy settings" className="space-y-3 py-3">
          <p>
            Optional Google Analytics and PostHog help us understand page use
            and selected actions. They load only if you accept. No replay,
            advertising or cross-site identity is used. Your choice stays on
            this site for six months; you can withdraw here anytime.
          </p>
          <p>
            Detailed product events are retained for up to 90 days and Google
            Analytics analysis data for 14 months. Minimal operational errors
            and availability checks continue independently.
          </p>
          {browserOptOut() ? (
            <p>
              Your browser’s opt-out signal keeps optional analytics disabled.
            </p>
          ) : null}
          {configForOrigin(app, location.origin) ? null : (
            <p>Optional analytics is currently disabled for this site.</p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={
                browserOptOut() || !configForOrigin(app, location.origin)
              }
              onClick={() => choose("accepted")}
              variant="outline"
            >
              Accept
            </Button>
            <Button onClick={() => choose("declined")} variant="outline">
              Decline
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
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
          <PublicAnalytics app={app} />
        </Suspense>
      ) : null}
    </>
  );
}
