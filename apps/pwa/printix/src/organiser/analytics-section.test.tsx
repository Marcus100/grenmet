// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsSection } from "@/organiser/analytics-section";
import { OrganiserSession, parseLogin } from "@/organiser/session";
import {
  ANALYTICS,
  EMPTY_ANALYTICS,
  EMPTY_SCANS,
  SCANS,
} from "@/test/fixtures";
import {
  countCalls,
  json,
  loginBody,
  ORIGIN,
  type Routes,
  routeFetch,
} from "@/test/organiser-fetch";

const ORGANISATION = "2c4e6a8b-1d3f-4a5b-9c7d-0e2f4a6b8c1d";
const BASE = `GET /api/v1/printix/org/events/${ANALYTICS.event.id}`;
const ANALYTICS_ROUTE = `${BASE}/analytics`;
const SCANS_ROUTE = `${BASE}/scans`;
const EXPORT_ROUTE = `${BASE}/scans/export`;

const BAR_CHART = /Bar chart/u;
const CHART_NAME = /120 people let in, from 18:01 to 19:28/u;
const CHART_SENTENCE =
  /120 people let in, from 18:01 to 19:28 \(1 hour 27 minutes\)\. The busiest five minutes began at 18:10, with 40 people\./u;
const BEARER = /^Bearer /u;
const QUIET_NOTE = /has not scanned for/u;
const SHOWING_LATEST = /Showing the latest 3 of 132 scans/u;
const NOT_FINAL = /for now and change until the event closes/u;
const NO_SCANS = /No scans yet\./u;

const CSV = "time,gate,printed_number,outcome,entry,offline\r\n";

function session() {
  const value = new OrganiserSession({ origin: ORIGIN, storage: null });
  value.adopt(parseLogin(loginBody({})));
  return value;
}

function routes(overrides: Routes = {}): Routes {
  return {
    [ANALYTICS_ROUTE]: () => json(200, ANALYTICS),
    [SCANS_ROUTE]: () => json(200, SCANS),
    ...overrides,
  };
}

function open(onAnnounce: (text: string) => void = () => undefined) {
  return render(
    <AnalyticsSection
      eventId={ANALYTICS.event.id}
      onAnnounce={onAnnounce}
      organisationId={ORGANISATION}
      session={session()}
    />
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the live dashboard", () => {
  it("shows the pace, the chart with its text summary, and the numbers behind it", async () => {
    const spy = routeFetch(routes());
    open();

    await screen.findByRole("heading", { name: "Live at the gates" });
    expect(screen.getByText("In the last 10 minutes")).toBeInTheDocument();
    expect(screen.getByText("1.5 a minute")).toBeInTheDocument();
    const chart = screen.getByRole("img", { name: BAR_CHART });
    expect(chart).toHaveAccessibleName(CHART_NAME);
    // The same facts as text beside the picture.
    expect(screen.getAllByText(CHART_SENTENCE).length).toBeGreaterThan(0);
    expect(
      screen.getByText("Show the numbers behind the chart")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "People let in" })
    ).toBeInTheDocument();
    expect(countCalls(spy, ANALYTICS_ROUTE)).toBe(1);
    expect(countCalls(spy, SCANS_ROUTE)).toBe(1);
  });

  it("asks for the latest 20 scans and names the organisation on every call", async () => {
    const spy = routeFetch(routes());
    open();
    await screen.findByRole("heading", { name: "Recent scans" });
    const call = spy.mock.calls
      .map(([request]) => request)
      .find((request) => new URL(request.url).pathname.endsWith("/scans"));
    expect(call).toBeDefined();
    expect(new URL(call?.url ?? "").searchParams.get("size")).toBe("20");
    expect(call?.headers.get("X-Barrels-Organisation")).toBe(ORGANISATION);
    expect(call?.headers.get("Authorization")).toMatch(BEARER);
  });

  it("shows each gate with its counts, typed share and last scan, and flags a quiet phone", async () => {
    routeFetch(routes());
    open();
    const gates = await screen.findByRole("heading", { name: "Gates" });
    const section = gates.closest("section");
    expect(section).not.toBeNull();
    const scope = within(section as HTMLElement);
    expect(scope.getByText("Main gate")).toBeInTheDocument();
    expect(scope.getByText("5% (5 of 100)")).toBeInTheDocument();
    expect(scope.getByText("19:29 (1 minute ago)")).toBeInTheDocument();
    expect(scope.getByText("19:05 (25 minutes ago)")).toBeInTheDocument();
    expect(
      scope.getByText("This phone has not scanned for 25 minutes. Check it.")
    ).toBeInTheDocument();
    // The busy gate is not flagged.
    expect(scope.getAllByText(QUIET_NOTE)).toHaveLength(1);
  });

  it("lists refusals by reason and the offline syncs and conflicts", async () => {
    routeFetch(routes());
    open();
    const refusals = await screen.findByRole("heading", {
      name: "Refused scans, by reason",
    });
    const scope = within(refusals.closest("section") as HTMLElement);
    expect(scope.getByText("Already in")).toBeInTheDocument();
    expect(scope.getByText("Not recognised")).toBeInTheDocument();
    expect(scope.getByText("Event closed")).toBeInTheDocument();
    expect(scope.getByText("12 refused in all.")).toBeInTheDocument();
    const offline = within(
      screen
        .getByRole("heading", { name: "Scans made without a connection" })
        .closest("section") as HTMLElement
    );
    expect(offline.getByText("Sent late and let in")).toBeInTheDocument();
    expect(offline.getByText("25 minutes")).toBeInTheDocument();
  });

  it("lists the latest scans with the printed number and how each was made", async () => {
    routeFetch(routes());
    open();
    const recent = await screen.findByRole("heading", { name: "Recent scans" });
    const scope = within(recent.closest("section") as HTMLElement);
    expect(scope.getAllByRole("listitem")).toHaveLength(3);
    expect(scope.getByText("205")).toBeInTheDocument();
    expect(scope.getByText("Refused, already in")).toBeInTheDocument();
    expect(scope.getByText("typed")).toBeInTheDocument();
    expect(scope.getByText("no ticket matched")).toBeInTheDocument();
    expect(scope.getByText("scanned, sent late")).toBeInTheDocument();
    expect(scope.getByText(SHOWING_LATEST)).toBeInTheDocument();
  });

  it("shows the report for an open event as not final", async () => {
    routeFetch(routes());
    open();
    const report = await screen.findByRole("heading", {
      name: "After the event",
    });
    const scope = within(report.closest("section") as HTMLElement);
    expect(scope.getByText(NOT_FINAL)).toBeInTheDocument();
    expect(scope.getByText("Not in yet")).toBeInTheDocument();
    expect(scope.getByText("278 (70%)")).toBeInTheDocument();
    expect(scope.getByText("18:01")).toBeInTheDocument();
    expect(scope.getByText("19:28")).toBeInTheDocument();
    expect(scope.getByText("60 people")).toBeInTheDocument();
    expect(scope.getByText("75% (90)")).toBeInTheDocument();
    expect(scope.getByText("25% (30)")).toBeInTheDocument();
  });

  it("calls a closed event's unused tickets no-shows and its numbers final", async () => {
    routeFetch(
      routes({
        [ANALYTICS_ROUTE]: () =>
          json(200, {
            ...ANALYTICS,
            event: { ...ANALYTICS.event, status: "closed" },
          }),
      })
    );
    open();
    const report = await screen.findByRole("heading", {
      name: "After the event",
    });
    const scope = within(report.closest("section") as HTMLElement);
    expect(
      scope.getByText("The event has closed, so these numbers are final.")
    ).toBeInTheDocument();
    expect(scope.getByText("No-shows")).toBeInTheDocument();
    // A closed event's gates are never flagged as quiet.
    expect(screen.queryByText(QUIET_NOTE)).not.toBeInTheDocument();
  });
});

describe("nothing to count yet", () => {
  it("still shows every part, each with a plain sentence", async () => {
    routeFetch(
      routes({
        [ANALYTICS_ROUTE]: () => json(200, EMPTY_ANALYTICS),
        [SCANS_ROUTE]: () => json(200, EMPTY_SCANS),
      })
    );
    open();
    await screen.findByRole("heading", { name: "Live at the gates" });
    for (const name of [
      "Arrivals every 5 minutes",
      "Gates",
      "Refused scans, by reason",
      "Scans made without a connection",
      "Recent scans",
      "After the event",
    ]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(
      screen.getAllByText(
        "No one has been let in yet. The chart fills in as people arrive."
      ).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("No gate codes have been made for this event yet.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("No scan has been refused yet.")
    ).toBeInTheDocument();
    expect(screen.getByText(NO_SCANS)).toBeInTheDocument();
    expect(
      screen.getByText(
        "No one has been let in yet, so there are no shares to show."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Nothing to list yet.")).toBeInTheDocument();
    expect(screen.getAllByText("None yet").length).toBeGreaterThan(0);
  });
});

describe("when a read fails", () => {
  it("says so in one sentence and keeps what it has", async () => {
    let calls = 0;
    routeFetch(
      routes({
        [ANALYTICS_ROUTE]: () => {
          calls += 1;
          return calls === 1
            ? json(200, ANALYTICS)
            : json(
                429,
                { detail: "Too many requests" },
                { "Retry-After": "30" }
              );
        },
      })
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      open();
      await screen.findByRole("heading", { name: "Gates" });
      await vi.advanceTimersByTimeAsync(10_000);
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(
        "Too many attempts. Try again in 30 seconds."
      );
      expect(
        screen.getByRole("heading", { name: "Gates" })
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the sentence for a refused session instead of numbers", async () => {
    routeFetch(
      routes({
        [ANALYTICS_ROUTE]: () => json(403, { detail: "Not allowed" }),
      })
    );
    open();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Gates" })
    ).not.toBeInTheDocument();
  });
});

describe("the scan list download", () => {
  it("saves the spreadsheet file the server sends, under a name with the event date", async () => {
    const spy = routeFetch(
      routes({
        [EXPORT_ROUTE]: () =>
          new Response(CSV, {
            status: 200,
            headers: { "content-type": "text/csv" },
          }),
      })
    );
    const saved: Blob[] = [];
    const created = vi.fn((blob: Blob) => {
      saved.push(blob);
      return "blob:scan-list";
    });
    const revoked = vi.fn();
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked });
    const names: string[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        names.push(this.download);
      });
    const announced = vi.fn();
    open(announced);

    fireEvent.click(
      await screen.findByRole("button", { name: "Save the scan list" })
    );
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));

    expect(names).toEqual(["printix-scans-2026-12-26.csv"]);
    expect(saved).toHaveLength(1);
    expect(await saved[0]?.text()).toBe(CSV);
    expect(revoked).toHaveBeenCalledWith("blob:scan-list");
    expect(announced).toHaveBeenCalledWith(
      "The scan list was saved to this device."
    );
    const request = spy.mock.calls
      .map(([call]) => call)
      .find((call) => new URL(call.url).pathname.endsWith("/scans/export"));
    expect(request?.headers.get("X-Barrels-Organisation")).toBe(ORGANISATION);
    click.mockRestore();
  });

  it("explains a refused download and leaves the page as it was", async () => {
    routeFetch(
      routes({
        [EXPORT_ROUTE]: () =>
          json(429, { detail: "Too many requests" }, { "Retry-After": "40" }),
      })
    );
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "Save the scan list" })
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Too many attempts. Try again in 40 seconds."
    );
    expect(
      screen.getByRole("button", { name: "Save the scan list" })
    ).toBeEnabled();
  });
});
