import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ElectionTimeline } from "@/components/election/election-timeline";
import { SeatHistory } from "@/components/home/seat-history";
import resultsJson from "@/data/derived/results";
import type { ElectionCalendar } from "@/data/election-2026";
import type { ResultsFile } from "@/data/types";

const DAYS_TO_GO = /33 days to go/;
const SEAT_COUNT = / (\d+)/g;
const calendar: ElectionCalendar = {
  announcement: "2026-10-04",
  deadline: "2027-01-02",
  dissolved: "2026-10-02",
  nominationDay: "2026-10-15",
  policePollingDay: "2026-11-02",
  pollingDay: "2026-11-05",
  writs: "2026-10-02",
};

describe("ElectionTimeline", () => {
  it("describes every date in text and counts down to polling day", () => {
    render(
      <ElectionTimeline
        calendar={calendar}
        now={new Date("2026-10-03T16:00:00Z")}
      />
    );
    const graphic = screen.getByRole("img");
    expect(graphic).toHaveAccessibleName(
      "Election calendar. Dissolved: 2 October 2026; Nomination day: 15 October 2026; Police poll: 2 November 2026; Polling day: 5 November 2026; Legal deadline: 2 January 2027."
    );
    expect(screen.getByText(DAYS_TO_GO)).toBeInTheDocument();
  });

  it("draws nothing until polling day is set", () => {
    const { container } = render(
      <ElectionTimeline
        calendar={{ ...calendar, pollingDay: null }}
        now={new Date("2026-10-03T16:00:00Z")}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SeatHistory", () => {
  it("lists every mapped general election with 15 seats in its table", () => {
    render(<SeatHistory results={resultsJson as unknown as ResultsFile} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(screen.getByRole("rowheader", { name: "2022" })).toBeInTheDocument();
    for (const row of rows) {
      const total = [...(row.textContent ?? "").matchAll(SEAT_COUNT)].reduce(
        (sum, m) => sum + Number(m[1]),
        0
      );
      expect(total).toBe(15);
    }
  });
});

describe("SeatHistory layout", () => {
  it("hides its table inside a wrapper, since tables ignore sr-only's width", () => {
    render(<SeatHistory results={resultsJson as unknown as ResultsFile} />);
    const table = screen.getByRole("table");
    expect(table).not.toHaveClass("sr-only");
    expect(table.parentElement).toHaveClass("sr-only");
  });
});
