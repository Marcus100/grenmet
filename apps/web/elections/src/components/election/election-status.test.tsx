import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElectionHeadline } from "@/components/election/election-headline";
import { ElectionStatus } from "@/components/election/election-status";
import { ElectionTimeline } from "@/components/election/election-timeline";
import type { ElectionCalendar } from "@/data/election-2026";

const calendar: ElectionCalendar = {
  announcement: "2026-10-04",
  deadline: "2027-01-02",
  dissolved: "2026-10-02",
  nominationDay: "2026-10-15",
  policePollingDay: "2026-11-02",
  pollingDay: "2026-11-05",
  writs: "2026-10-02",
};
const undated: ElectionCalendar = { ...calendar, pollingDay: null };
const NO_DATE_WORDS = /votes|days/u;
const DAYS_TO_GO = /days to go/u;
const CALENDAR_LABEL = /Election calendar\./u;

/** Fake only the clock: effects and timers stay real. */
function setToday(iso: string) {
  vi.setSystemTime(new Date(iso));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ElectionStatus in the browser", () => {
  it("states the days to polling day from the visitor's date", () => {
    setToday("2026-11-02T12:00:00Z");
    render(<ElectionStatus calendar={calendar} />);
    expect(screen.getByText("Grenada votes in 3 days")).toBeInTheDocument();
  });

  it("switches on the Grenada date, not the UTC date", () => {
    // 23:30 on 4 November in Grenada (UTC−4): still "tomorrow", though it is 5 November in UTC.
    setToday("2026-11-05T03:30:00Z");
    const { unmount } = render(<ElectionStatus calendar={calendar} />);
    expect(screen.getByText("Grenada votes tomorrow")).toBeInTheDocument();
    unmount();

    // 00:00 on polling day in Grenada.
    setToday("2026-11-05T04:00:00Z");
    render(<ElectionStatus calendar={calendar} />);
    expect(screen.getByText("Grenada votes today")).toBeInTheDocument();
  });

  it("puts the prefix before the status", () => {
    setToday("2026-11-02T12:00:00Z");
    render(
      <ElectionStatus calendar={calendar} prefix="General election 2026" />
    );
    expect(
      screen.getByText("General election 2026 · Grenada votes in 3 days")
    ).toBeInTheDocument();
  });
});

describe("ElectionStatus on the server and with JavaScript off", () => {
  it("renders only the date-free fallback, never a day count", () => {
    setToday("2026-11-02T12:00:00Z");
    const html = renderToStaticMarkup(
      <ElectionStatus
        calendar={calendar}
        fallback="Grenada’s 2026 general election"
      />
    );
    expect(html).toBe("Grenada’s 2026 general election");
    expect(html).not.toMatch(NO_DATE_WORDS);
  });

  it("renders the prefix alone when there is no fallback", () => {
    expect(
      renderToStaticMarkup(
        <ElectionStatus calendar={calendar} prefix="General election 2026" />
      )
    ).toBe("General election 2026");
  });
});

describe("ElectionHeadline", () => {
  it("waits for the browser's date before saying the date is due", () => {
    setToday("2026-10-02T12:00:00Z");
    render(
      <ElectionHeadline
        calendar={undated}
        fallback="Grenada’s 2026 election: key dates"
      />
    );
    expect(
      screen.getByText("Grenada’s election date is due on 4 October 2026")
    ).toBeInTheDocument();
  });

  it("says the election date is still waited for once the announcement day has passed", () => {
    setToday("2026-10-05T12:00:00Z");
    render(
      <ElectionHeadline
        calendar={undated}
        fallback="Grenada’s 2026 election: key dates"
      />
    );
    expect(
      screen.getByText("Grenada waits for its election date")
    ).toBeInTheDocument();
  });

  it("states polling day without needing today's date, even on the server", () => {
    expect(
      renderToStaticMarkup(
        <ElectionHeadline calendar={calendar} fallback="fallback" />
      )
    ).toBe("Grenada votes on 5 November 2026");
  });

  it("shows the date-free fallback on the server when the date is unannounced", () => {
    expect(
      renderToStaticMarkup(
        <ElectionHeadline
          calendar={undated}
          fallback="Grenada’s 2026 election: key dates"
        />
      )
    ).toBe("Grenada’s 2026 election: key dates");
  });
});

describe("ElectionTimeline today marker", () => {
  it("marks today from the visitor's date when no date is passed", () => {
    setToday("2026-11-02T12:00:00Z");
    render(<ElectionTimeline calendar={calendar} />);
    expect(screen.getByText("3 days to go")).toBeInTheDocument();
  });

  it("draws no today marker in the server render", () => {
    setToday("2026-11-02T12:00:00Z");
    const html = renderToStaticMarkup(<ElectionTimeline calendar={calendar} />);
    expect(html).not.toMatch(DAYS_TO_GO);
    expect(html).toMatch(CALENDAR_LABEL);
  });
});
