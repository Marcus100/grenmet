import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { staffGate } from "@/test/desk-gate.fixture";

const gate = vi.hoisted(() => ({ requireDeskGate: vi.fn() }));
const api = vi.hoisted(() => ({ getStatistics: vi.fn() }));
const report = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@/lib/desk/gate", () => gate);
vi.mock("@/lib/desk/api", () => api);
vi.mock("@/lib/report-error", () => report);

import Loading from "./loading";
import StatisticsPage from "./page";

const SAINT_ANDREW_ROW = /Saint Andrew/u;

const COLOURS = ["green", "yellow", "orange", "red"].map((key) => ({
  count: 0,
  key,
  label: key[0]?.toUpperCase() + key.slice(1),
}));

function statistics(overrides: Record<string, unknown> = {}) {
  return {
    by_colour: [
      ...COLOURS.map((row) =>
        row.key === "orange" ? { ...row, count: 2 } : row
      ),
      { count: 0, key: "unassigned", label: "No colour assigned" },
    ],
    by_hazard: [
      {
        count: 2,
        key: "Heavy Rainfall Warning",
        label: "Heavy Rainfall Warning",
      },
    ],
    by_month: [
      { count: 0, key: "2026-01", label: "January 2026" },
      { count: 2, key: "2026-02", label: "February 2026" },
    ],
    by_parish: [
      { count: 2, key: "george", label: "Saint George" },
      { count: 0, key: "andrew", label: "Saint Andrew" },
    ],
    end: "2026-02-28",
    hazard: null,
    start: "2026-01-01",
    total: 2,
    ...overrides,
  };
}

function page(params: Record<string, string | string[]> = {}) {
  return StatisticsPage({ searchParams: Promise.resolve(params) });
}

beforeEach(() => {
  vi.clearAllMocks();
  gate.requireDeskGate.mockResolvedValue(staffGate());
  api.getStatistics.mockResolvedValue(statistics());
});

describe("/desk/statistics", () => {
  it("shows the loading state", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading the warning statistics"
    );
  });

  it("shows the refusal for a staff account without CAP access", async () => {
    gate.requireDeskGate.mockResolvedValue({
      email: "x@example.test",
      status: "refused",
    });
    render(await page());
    expect(
      screen.getByRole("heading", { name: "No access to CAP warnings" })
    ).toBeInTheDocument();
  });

  it("names the missing permission", async () => {
    gate.requireDeskGate.mockResolvedValue(staffGate({ read: false }));
    render(await page());
    expect(screen.getByRole("alert")).toHaveTextContent("cap.alert.read");
    expect(api.getStatistics).not.toHaveBeenCalled();
  });

  it("shows the four tables and the total, and asks the API for the filters", async () => {
    render(
      await page({ hazard: "Heavy Rainfall Warning", start: "2026-01-01" })
    );
    expect(api.getStatistics).toHaveBeenCalledWith("token-test", {
      end: null,
      hazard: "Heavy Rainfall Warning",
      start: "2026-01-01",
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "2 warnings published from 2026-01-01 to 2026-02-28"
    );
    for (const name of ["By hazard", "By colour", "By parish", "By month"]) {
      expect(
        screen.getByRole("heading", { name, level: 2 })
      ).toBeInTheDocument();
    }
  });

  it("lists zero counts instead of hiding empty rows", async () => {
    render(await page());
    const parish = screen
      .getByRole("heading", { name: "By parish" })
      .closest("section") as HTMLElement;
    const andrew = within(parish).getByRole("row", { name: SAINT_ANDREW_ROW });
    expect(andrew).toHaveTextContent("0");
    const colour = screen
      .getByRole("heading", { name: "By colour" })
      .closest("section") as HTMLElement;
    expect(within(colour).getAllByRole("row")).toHaveLength(1 + 5);
  });

  it("shows an empty state, not a missing section, when nothing was published", async () => {
    api.getStatistics.mockResolvedValue(
      statistics({ by_hazard: [], total: 0 })
    );
    render(await page());
    expect(screen.getByRole("status")).toHaveTextContent(
      "0 warnings published"
    );
    expect(
      screen.getByText("No warnings were published in this period.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "By month" })
    ).toBeInTheDocument();
  });

  it("links each hazard to its own filtered view and offers the CSV for the period shown", async () => {
    render(await page());
    expect(
      screen.getByRole("link", { name: "Heavy Rainfall Warning" })
    ).toHaveAttribute(
      "href",
      "/desk/statistics?start=2026-01-01&end=2026-02-28&hazard=Heavy+Rainfall+Warning"
    );
    expect(screen.getByRole("link", { name: "Download CSV" })).toHaveAttribute(
      "href",
      "/desk/statistics/export?start=2026-01-01&end=2026-02-28"
    );
  });

  it("keeps the hazard filter in the CSV link", async () => {
    api.getStatistics.mockResolvedValue(
      statistics({ hazard: "Heavy Rainfall Warning" })
    );
    render(await page({ hazard: "Heavy Rainfall Warning" }));
    expect(screen.getByRole("link", { name: "Download CSV" })).toHaveAttribute(
      "href",
      "/desk/statistics/export?start=2026-01-01&end=2026-02-28&hazard=Heavy+Rainfall+Warning"
    );
  });

  it("refuses a bad date with its reason and does not call the API", async () => {
    render(await page({ start: "2026-02-30" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The start date must be a real day"
    );
    expect(api.getStatistics).not.toHaveBeenCalled();
  });

  it("shows unavailable and reports an unexpected failure", async () => {
    const boom = new Error("down");
    api.getStatistics.mockRejectedValue(boom);
    render(await page());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The warning statistics could not be loaded"
    );
    expect(report.reportError).toHaveBeenCalledWith(
      boom,
      "cap-desk-statistics-page"
    );
  });
});
