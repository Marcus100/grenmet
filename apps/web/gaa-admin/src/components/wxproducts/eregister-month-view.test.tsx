import type { RegisterObservationRead } from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  reviewDay: vi.fn(),
}));

vi.mock("@barrelsgd/api-client", () => ({
  eregisterListRegisterObservations: mocks.list,
  eregisterReviewRegisterDay: mocks.reviewDay,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

import { IMPORT_NOTE_PREFIX, NO_FILTERS } from "./eregister-month";
import { MonthWorkbook } from "./eregister-month-view";

const DAY_14 = /^Wed 14 Oct/u;

function observation(
  overrides: Partial<RegisterObservationRead>
): RegisterObservationRead {
  return {
    actor_id: "u1",
    actor_name: "Observer One",
    body: { notes: `${IMPORT_NOTE_PREFIX}, row 2`, TT: "275" },
    coded: "AAXX 14164 78958",
    created_at: "2026-10-14T16:05:00Z",
    id: "o1",
    issues: [],
    kind: "SYNOP",
    observed_at: "2026-10-14T16:00:00Z",
    state: "historical",
    station_id: "78958",
    updated_at: "2026-10-14T16:05:00Z",
    ...overrides,
  } as RegisterObservationRead;
}

function listing(observations: RegisterObservationRead[]) {
  return {
    data: { observations, total: observations.length },
    response: new Response(null, { status: 200 }),
  };
}

describe("MonthWorkbook", () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.replace.mockReset();
    mocks.push.mockReset();
    mocks.reviewDay.mockReset();
  });

  it("loads the local month range and shows recorded and missing hours", async () => {
    mocks.list.mockResolvedValue(
      listing([
        observation({
          issues: [
            {
              code: "t",
              field: "",
              message: "Temperature looks high",
              severity: "warning",
            },
          ],
        }),
      ])
    );
    render(<MonthWorkbook filters={NO_FILTERS} month="2026-10" />);

    expect(await screen.findByText("Temperature looks high")).toBeTruthy();
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          kind: "SYNOP",
          observed_from: "2026-10-01T04:00:00.000Z",
          observed_to: "2026-11-01T04:00:00.000Z",
          station_id: "78958",
        }),
      })
    );
    expect(screen.getAllByText("Not recorded")).toHaveLength(31 * 24 - 1);
    expect(screen.getByRole("status", { name: "" }).textContent).toContain(
      "1 of 744 hours recorded"
    );
  });

  it("says when the account has no register access", async () => {
    mocks.list.mockResolvedValue({
      error: { detail: "Forbidden" },
      response: new Response(null, { status: 403 }),
    });
    render(<MonthWorkbook filters={NO_FILTERS} month="2026-10" />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "don't have access"
    );
  });

  it("puts a chosen day and filters in the URL", async () => {
    mocks.list.mockResolvedValue(listing([observation({})]));
    render(<MonthWorkbook filters={NO_FILTERS} month="2026-10" />);
    await screen.findByText("Historical");

    fireEvent.click(screen.getByRole("button", { name: DAY_14 }));
    expect(mocks.push).toHaveBeenLastCalledWith(
      "/wxproducts/hourly/month?month=2026-10&day=2026-10-14",
      { scroll: false }
    );

    fireEvent.change(screen.getByLabelText("State"), {
      target: { value: "historical" },
    });
    expect(mocks.replace).toHaveBeenLastCalledWith(
      "/wxproducts/hourly/month?month=2026-10&state=historical",
      { scroll: false }
    );
  });

  it("reviews a day and reports what was left alone", async () => {
    mocks.list.mockResolvedValue(listing([observation({})]));
    mocks.reviewDay.mockResolvedValue({
      data: { reviewed: 20, skipped_already: 1, skipped_own: 3 },
      response: new Response(null, { status: 200 }),
    });
    render(
      <MonthWorkbook day="2026-10-14" filters={NO_FILTERS} month="2026-10" />
    );
    await screen.findByText("Historical");
    expect(screen.getAllByText("Not recorded")).toHaveLength(23);

    fireEvent.click(screen.getByRole("button", { name: "Review this day" }));
    await waitFor(() =>
      expect(mocks.reviewDay).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            date: "2026-10-14",
            note: null,
            outcome: "reviewed",
            station_id: "78958",
          },
        })
      )
    );
    expect(
      await screen.findByText(
        "20 records marked reviewed. 3 left for someone else: you recorded them. 1 already reviewed."
      )
    ).toBeTruthy();
  });

  it("needs a note before a day query", async () => {
    mocks.list.mockResolvedValue(listing([]));
    render(
      <MonthWorkbook day="2026-10-14" filters={NO_FILTERS} month="2026-10" />
    );
    fireEvent.click(await screen.findByLabelText("Query (needs a note)"));
    const button = screen.getByRole("button", { name: "Review this day" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Note (required)"), {
      target: { value: "Pressure tendency looks wrong all morning" },
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});
