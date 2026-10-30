import type { RegisterObservationRead } from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  list: vi.fn(),
  reject: vi.fn(),
  reopen: vi.fn(),
  review: vi.fn(),
}));

vi.mock("@barrelsgd/api-client", () => ({
  eregisterAcceptRegisterObservation: mocks.accept,
  eregisterListRegisterObservations: mocks.list,
  eregisterRejectRegisterObservation: mocks.reject,
  eregisterReopenRegisterObservation: mocks.reopen,
  eregisterReviewRegisterObservation: mocks.review,
}));

import { decisionError, PAGE_SIZE, QcBadge, QcQueue } from "./eregister-qc";

const ME = "user-me";
const OTHER = "user-other";
const MINE = "11111111-1111-4111-8111-111111111111";
const THEIRS = "22222222-2222-4222-8222-222222222222";
const DONE = "33333333-3333-4333-8333-333333333333";

function observation(
  overrides: Partial<RegisterObservationRead>
): RegisterObservationRead {
  return {
    actor_id: OTHER,
    actor_name: "Pat Observer",
    coded: "AAXX 18124 78958 11468 10715=",
    created_at: "2026-10-18T12:01:00",
    id: THEIRS,
    issues: [],
    kind: "SYNOP",
    observed_at: "2026-10-18T12:00:00",
    state: "draft",
    station_id: "78958",
    updated_at: "2026-10-18T12:01:00",
    ...overrides,
  } as RegisterObservationRead;
}

const REASON_LABEL = /Reason \(required\)/u;
const NOTE_LABEL = /Note \(optional\)/u;
const RECORDED_BY = /Recorded by Pat Observer/u;
const STANDARD_HOURS = /standard hours/u;
const ERROR_NOT_LISTED = /error is not listed/u;
const CHANGED_MESSAGE = /saved or decided since you opened it/u;
const OWN_HINT = /another person reviews it/u;

/** Answer each queue by the filter the panel sends. */
function serve(queues: {
  awaiting?: RegisterObservationRead[];
  review?: RegisterObservationRead[];
  total?: number;
}) {
  mocks.list.mockImplementation(
    (options: { query: { state: string; offset?: number } }) => {
      const awaiting = options.query.state === "draft,qc_pending";
      const rows = awaiting ? (queues.awaiting ?? []) : (queues.review ?? []);
      return Promise.resolve({
        data: {
          observations: rows,
          total: awaiting ? rows.length : (queues.total ?? rows.length),
        },
        error: undefined,
      });
    }
  );
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
});

describe("QcBadge", () => {
  it("labels each state", () => {
    render(<QcBadge state="accepted" />);
    expect(screen.getByText("Accepted")).toBeTruthy();
  });
});

describe("decisionError", () => {
  it("prefers the server detail, plain or with issues", () => {
    expect(decisionError({ detail: "Cannot accept" }, 409)).toBe(
      "Cannot accept"
    );
    expect(decisionError({ detail: { message: "dew_point: bad" } }, 422)).toBe(
      "dew_point: bad"
    );
    expect(decisionError(undefined, 403)).toContain("permission");
  });
});

describe("QcQueue", () => {
  it("asks the server for each queue by state, not for the latest rows", async () => {
    serve({});
    render(<QcQueue onDecided={vi.fn()} userId={ME} />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    const queries = mocks.list.mock.calls.map((call) => call[0].query);
    expect(queries).toContainEqual(
      expect.objectContaining({
        kind: "SYNOP",
        limit: PAGE_SIZE,
        offset: 0,
        state: "draft,qc_pending",
      })
    );
    expect(queries).toContainEqual(
      expect.objectContaining({ reviewed: false, state: "accepted" })
    );
    expect(
      await screen.findByText("No observations are waiting for acceptance.")
    ).toBeTruthy();
    expect(
      screen.getByText("No accepted observations are waiting for a review.")
    ).toBeTruthy();
  });

  it("shows the coded row, warnings and who recorded each item", async () => {
    serve({
      awaiting: [
        observation({
          issues: [
            {
              code: "non_synoptic_hour",
              field: "time_utc",
              message: "SYNOP is made at the standard hours",
              severity: "warning",
            },
            {
              code: "x",
              field: "air_temp",
              message: "an error is not listed as a warning",
              severity: "error",
            },
          ],
        }),
      ],
    });
    render(<QcQueue onDecided={vi.fn()} userId={ME} />);
    expect(
      await screen.findByText("AAXX 18124 78958 11468 10715=")
    ).toBeTruthy();
    expect(screen.getByText(RECORDED_BY)).toBeTruthy();
    expect(screen.getByText(STANDARD_HOURS)).toBeTruthy();
    expect(screen.queryByText(ERROR_NOT_LISTED)).toBeNull();
  });

  it("lets the observer accept their own draft", async () => {
    const updated = observation({ actor_id: ME, id: MINE, state: "accepted" });
    mocks.accept.mockResolvedValue({ data: updated, error: undefined });
    serve({ awaiting: [observation({ actor_id: ME, id: MINE })] });
    const onDecided = vi.fn();
    render(<QcQueue onDecided={onDecided} userId={ME} />);
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    expect(screen.getByText(NOTE_LABEL)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept observation" }));
    await waitFor(() => expect(onDecided).toHaveBeenCalledWith(updated));
    expect(mocks.accept.mock.calls[0]?.[0]).toMatchObject({
      body: { reason: null },
      path: { observation_id: MINE },
    });
    // The queues are read again after the decision.
    await waitFor(() =>
      expect(mocks.list.mock.calls.length).toBeGreaterThan(2)
    );
  });

  it("blocks reviewing your own accepted observation and allows others", async () => {
    serve({
      review: [
        observation({ actor_id: ME, id: MINE, state: "accepted" }),
        observation({ id: THEIRS, state: "accepted" }),
      ],
    });
    render(<QcQueue onDecided={vi.fn()} userId={ME} />);
    await screen.findByText(OWN_HINT);
    const review = screen.getAllByRole("button", { name: "Review" });
    expect((review[0] as HTMLButtonElement).disabled).toBe(true);
    expect((review[1] as HTMLButtonElement).disabled).toBe(false);
  });

  it("records a review with an outcome and requires a note for a query", async () => {
    mocks.review.mockResolvedValue({
      data: observation({ review_outcome: "query", state: "accepted" }),
      error: undefined,
    });
    serve({ review: [observation({ state: "accepted" })] });
    render(<QcQueue onDecided={vi.fn()} userId={ME} />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    const save = screen.getByRole("button", { name: "Save review" });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText("Query"));
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(REASON_LABEL), {
      target: { value: "Pressure looks high" },
    });
    fireEvent.click(save);
    await waitFor(() => expect(mocks.review).toHaveBeenCalledTimes(1));
    expect(mocks.review.mock.calls[0]?.[0]).toMatchObject({
      body: {
        note: "Pressure looks high",
        outcome: "query",
        updated_at: "2026-10-18T12:01:00",
      },
      path: { observation_id: THEIRS },
    });
  });

  it("shows the conflict message when the record changed since it was opened", async () => {
    mocks.review.mockResolvedValue({
      data: undefined,
      error: {
        detail: "The observation was saved or decided since you opened it",
      },
      response: { status: 409 },
    });
    serve({ review: [observation({ state: "accepted" })] });
    render(<QcQueue onDecided={vi.fn()} userId={ME} />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Save review" }));
    expect(await screen.findByText(CHANGED_MESSAGE)).toBeTruthy();
  });

  it("needs a reason before rejecting", async () => {
    mocks.reject.mockResolvedValue({
      data: observation({ state: "rejected" }),
      error: undefined,
    });
    serve({ awaiting: [observation({})] });
    render(<QcQueue onDecided={vi.fn()} userId={ME} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    const confirm = screen.getByRole("button", { name: "Reject observation" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(REASON_LABEL), {
      target: { value: "Wrong station" },
    });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.reject).toHaveBeenCalledTimes(1));
    expect(mocks.reject.mock.calls[0]?.[0]).toMatchObject({
      body: { reason: "Wrong station" },
    });
  });

  it("shows the server's refusal and keeps the dialog open", async () => {
    mocks.accept.mockResolvedValue({
      data: undefined,
      error: {
        detail: {
          issues: [],
          message: "Observation does not pass validation: dew_point",
        },
      },
      response: { status: 422 },
    });
    serve({ awaiting: [observation({})] });
    const onDecided = vi.fn();
    render(<QcQueue onDecided={onDecided} userId={ME} />);
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept observation" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("dew_point")
    );
    expect(onDecided).not.toHaveBeenCalled();
  });

  it("pages through a long queue from the server", async () => {
    serve({ review: [observation({ state: "accepted" })], total: 25 });
    render(<QcQueue onDecided={vi.fn()} userId={ME} />);
    await screen.findByText("Page 1 of 3");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(
        mocks.list.mock.calls.some((call) => call[0].query.offset === PAGE_SIZE)
      ).toBe(true)
    );
    await screen.findByText("Page 2 of 3");
  });

  it("reopens an accepted observation with a reason", async () => {
    mocks.reopen.mockResolvedValue({
      data: observation({ id: DONE, state: "qc_pending" }),
      error: undefined,
    });
    serve({ review: [observation({ id: DONE, state: "accepted" })] });
    render(<QcQueue onDecided={vi.fn()} userId={ME} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reopen" }));
    fireEvent.change(screen.getByLabelText(REASON_LABEL), {
      target: { value: "Observer corrected it" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reopen observation" }));
    await waitFor(() => expect(mocks.reopen).toHaveBeenCalledTimes(1));
  });
});
