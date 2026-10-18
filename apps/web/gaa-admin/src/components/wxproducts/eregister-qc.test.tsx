import type { RegisterObservationRead } from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  reject: vi.fn(),
  reopen: vi.fn(),
}));

vi.mock("@barrelsgd/api-client", () => ({
  eregisterAcceptRegisterObservation: mocks.accept,
  eregisterRejectRegisterObservation: mocks.reject,
  eregisterReopenRegisterObservation: mocks.reopen,
}));

import { decisionError, QcBadge, QcQueue } from "./eregister-qc";

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
    created_at: "2026-10-18T12:01:00",
    id: THEIRS,
    kind: "SYNOP",
    observed_at: "2026-10-18T12:00:00",
    state: "draft",
    station_id: "78958",
    updated_at: "2026-10-18T12:01:00",
    ...overrides,
  } as RegisterObservationRead;
}

const REASON_LABEL = /Reason \(required\)/;
const NOTE_LABEL = /Note \(optional\)/;
const OWN_HINT = /another person must accept/;

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
});

describe("QcBadge", () => {
  it("labels each QC state", () => {
    render(<QcBadge state="accepted" />);
    expect(screen.getByText("Accepted")).toBeTruthy();
  });
});

describe("decisionError", () => {
  it("prefers the server detail", () => {
    expect(decisionError({ detail: "Cannot accept" }, 409)).toBe(
      "Cannot accept"
    );
    expect(decisionError(undefined, 403)).toContain("QC permission");
  });
});

describe("QcQueue", () => {
  it("lists pending observations and blocks accepting your own", () => {
    render(
      <QcQueue
        observations={[
          observation({ actor_id: ME, id: MINE }),
          observation({ id: THEIRS }),
          observation({ id: DONE, state: "accepted" }),
        ]}
        onDecided={vi.fn()}
        userId={ME}
      />
    );
    expect(screen.getByText("QC queue (2)")).toBeTruthy();
    expect(screen.getByText(OWN_HINT)).toBeTruthy();
    const accept = screen.getAllByRole("button", { name: "Accept" });
    expect((accept[0] as HTMLButtonElement).disabled).toBe(true);
    expect((accept[1] as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Reopen" })).toBeTruthy();
  });

  it("says when nothing is waiting", () => {
    render(<QcQueue observations={[]} onDecided={vi.fn()} userId={ME} />);
    expect(
      screen.getByText("No observations are waiting for QC.")
    ).toBeTruthy();
  });

  it("accepts with an optional note and reports the updated record", async () => {
    const updated = observation({ id: THEIRS, state: "accepted" });
    mocks.accept.mockResolvedValue({ data: updated, error: undefined });
    const onDecided = vi.fn();
    render(
      <QcQueue
        observations={[observation({ id: THEIRS })]}
        onDecided={onDecided}
        userId={ME}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(screen.getByText(NOTE_LABEL)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept observation" }));
    await waitFor(() => expect(onDecided).toHaveBeenCalledWith(updated));
    expect(mocks.accept.mock.calls[0]?.[0]).toMatchObject({
      body: { reason: null },
      path: { observation_id: THEIRS },
    });
  });

  it("needs a reason before rejecting", async () => {
    mocks.reject.mockResolvedValue({
      data: observation({ state: "rejected" }),
      error: undefined,
    });
    render(
      <QcQueue
        observations={[observation({})]}
        onDecided={vi.fn()}
        userId={ME}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
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
      error: { detail: "A different person from the observer must accept" },
      response: { status: 403 },
    });
    const onDecided = vi.fn();
    render(
      <QcQueue
        observations={[observation({})]}
        onDecided={onDecided}
        userId={ME}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept observation" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "different person"
      )
    );
    expect(onDecided).not.toHaveBeenCalled();
  });

  it("reopens a decided observation with a reason", async () => {
    mocks.reopen.mockResolvedValue({
      data: observation({ id: DONE, state: "qc_pending" }),
      error: undefined,
    });
    render(
      <QcQueue
        observations={[observation({ id: DONE, state: "accepted" })]}
        onDecided={vi.fn()}
        userId={ME}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    fireEvent.change(screen.getByLabelText(REASON_LABEL), {
      target: { value: "Observer corrected it" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reopen observation" }));
    await waitFor(() => expect(mocks.reopen).toHaveBeenCalledTimes(1));
  });
});
