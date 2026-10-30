"use client";

import { useEffect, useState } from "react";
import { QrCode } from "@/app/security/qr-code";
import { errorBoxClass } from "@/components/form-styles";

/** The venue code changes every minute; fetch a fresh one this often. */
export const REFRESH_SECONDS = 30;

export interface VenueCode {
  readonly refreshAfterSeconds: number;
  readonly token: string;
}

type Problem = "session" | "gone" | "retry" | null;

const PROBLEM_TEXT: Record<Exclude<Problem, null>, string> = {
  gone: "This venue's code isn't available any more. Go back and check the venue is still active.",
  retry:
    "Couldn't refresh the code. Trying again shortly. Don't use the code below until this message goes away.",
  session: "Your session has ended. Sign in again to keep showing the code.",
};

function isCode(
  value: unknown
): value is { refresh_after_seconds: number; token: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "token" in value &&
    typeof value.token === "string" &&
    "refresh_after_seconds" in value &&
    typeof value.refresh_after_seconds === "number"
  );
}

async function fetchCode(
  url: string,
  signal: AbortSignal
): Promise<VenueCode | Exclude<Problem, null | "retry">> {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (response.status === 401) return "session";
  if (response.status === 403 || response.status === 404) return "gone";
  if (!response.ok) throw new Error("refresh failed");
  const body: unknown = await response.json();
  if (!isCode(body)) throw new Error("unexpected response");
  return { refreshAfterSeconds: body.refresh_after_seconds, token: body.token };
}

/**
 * Shows a venue's check-in code large enough to read across a counter, and
 * keeps it fresh by polling a route that only proxies to the API.
 */
export function VenueCodeDisplay({
  initial,
  refreshUrl,
  venueName,
}: {
  readonly initial: VenueCode | null;
  readonly refreshUrl: string;
  readonly venueName: string;
}) {
  const [code, setCode] = useState<VenueCode | null>(initial);
  const [problem, setProblem] = useState<Problem>(initial ? null : "retry");

  const everyMs =
    Math.min(REFRESH_SECONDS, code?.refreshAfterSeconds ?? REFRESH_SECONDS) *
    1000;

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const next = await fetchCode(refreshUrl, controller.signal);
        if (typeof next === "string") {
          setProblem(next);
          return;
        }
        setCode(next);
        setProblem(null);
      } catch {
        if (!controller.signal.aborted) setProblem("retry");
      }
    }
    // Nothing to show yet (the first fetch failed): try straight away.
    if (!initial) refresh();
    const timer = setInterval(refresh, everyMs);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refreshUrl, everyMs, initial]);

  return (
    <div className="space-y-5">
      {problem ? (
        <p className={errorBoxClass} role="alert">
          {PROBLEM_TEXT[problem]}
        </p>
      ) : null}
      {code ? (
        <div className="border-border space-y-4 rounded-2xl border p-5 text-center sm:p-8">
          <p className="text-muted-foreground text-sm">
            Check-in code for {venueName}
          </p>
          <p
            className="text-foreground font-mono text-xl font-semibold tracking-wide break-all sm:text-3xl"
            data-testid="venue-code"
          >
            {code.token}
          </p>
          <div className="flex justify-center">
            <QrCode
              label={`QR code with the check-in code for ${venueName}`}
              value={code.token}
            />
          </div>
        </div>
      ) : null}
      <p className="text-muted-foreground text-sm">
        This code changes about every minute and is refreshed here every{" "}
        {REFRESH_SECONDS} seconds. Customers scan or type it in their Barrels
        account under Rewards. A printed QR can encode this value, but a printed
        copy stops working within minutes, so keep this screen open at the
        venue. Rewards come from real visits, never from opening the app.
      </p>
    </div>
  );
}
