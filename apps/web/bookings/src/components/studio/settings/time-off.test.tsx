import type { BookingExceptionPublic } from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  removeTimeOffAction: vi.fn(),
  saveTimeOffAction: vi.fn(),
}));
vi.mock("@/app/studio/[orgSlug]/settings/actions", () => actions);

import { TimeOffSection } from "./time-off";

const PROVIDER = "33333333-3333-4333-8333-333333333333";
const LEAVE = "55555555-5555-4555-8555-555555555555";
const ZONE = "America/Grenada";
const NONE = /No time off planned/u;
const NOT_YOU = /An owner or admin can add time off here/u;
const NINE = /Time off: .*9:00/u;
const REMOVE_THIS = /^Remove/u;
const CONFIRM_REMOVE = "Remove time off";
const STARTS = /^Starts$/u;
const ENDS = /^Ends$/u;
const REASON = /Reason/u;
const ADD = "Add time off";
const END_AFTER = "The end must be after the start.";
const BUSINESS_CLOCK = /business clock \(America\/Grenada\)/u;

// 13:00 UTC is 09:00 in America/Grenada (UTC-4 all year).
const exception: BookingExceptionPublic = {
  id: LEAVE,
  provider_id: PROVIDER,
  kind: "time_off",
  starts_at: "2026-11-20T13:00:00Z",
  ends_at: "2026-11-20T21:00:00Z",
  reason: "Annual leave",
};

function section(
  overrides: Partial<Parameters<typeof TimeOffSection>[0]> = {}
) {
  return render(
    <TimeOffSection
      editable
      exceptions={[]}
      orgSlug="sea-salt"
      providerId={PROVIDER}
      zone={ZONE}
      {...overrides}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("time off list", () => {
  it("shows the empty state with the add form for an admin", () => {
    section();
    expect(screen.getByText(NONE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ADD })).toBeEnabled();
    expect(screen.getByText(BUSINESS_CLOCK)).toBeVisible();
  });

  it("lists the time off with its reason and removal", () => {
    section({ exceptions: [exception] });
    expect(screen.getByText(NINE)).toBeInTheDocument();
    expect(screen.getByText("Annual leave")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: REMOVE_THIS })).toBeEnabled();
    expect(screen.queryByText(NONE)).not.toBeInTheDocument();
  });

  it("shows the empty state to a member with no form and no removal", () => {
    section({ editable: false });
    expect(screen.getByText(NONE)).toBeInTheDocument();
    expect(screen.getByText(NOT_YOU)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("lists time off for a member without offering to change it", () => {
    section({ editable: false, exceptions: [exception] });
    expect(screen.getByText(NINE)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("time off that could not be loaded", () => {
  it("says so inline and offers no add form or removal", () => {
    section({ unavailable: true, exceptions: [] });
    expect(
      screen.getByText("Time off could not be loaded. Try again later.")
    ).toBeInTheDocument();
    expect(screen.queryByText(NONE)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ADD })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: REMOVE_THIS })
    ).not.toBeInTheDocument();
  });
});

describe("add time off", () => {
  it("clears the form and announces a saved add", async () => {
    actions.saveTimeOffAction.mockResolvedValue({
      status: "success",
      message: "Time off added.",
    });
    section();
    fireEvent.change(screen.getByLabelText(STARTS), {
      target: { value: "2026-11-20T09:00" },
    });
    fireEvent.change(screen.getByLabelText(ENDS), {
      target: { value: "2026-11-20T17:00" },
    });
    fireEvent.change(screen.getByLabelText(REASON), {
      target: { value: "Annual leave" },
    });
    fireEvent.click(screen.getByRole("button", { name: ADD }));

    expect(
      (await screen.findByText("Time off added.")).parentElement
    ).toHaveAttribute("role", "status");
    await waitFor(() => expect(screen.getByLabelText(STARTS)).toHaveValue(""));
    expect(screen.getByLabelText(ENDS)).toHaveValue("");
    expect(screen.getByLabelText(REASON)).toHaveValue("");
    expect(actions.saveTimeOffAction.mock.calls[0]?.[0]).toBe("sea-salt");
  });

  it("keeps what was typed and marks the field the API refused", async () => {
    actions.saveTimeOffAction.mockResolvedValue({
      status: "error",
      kind: "invalid",
      message: "Check the highlighted fields.",
      nextStep: "Fix the highlighted fields.",
      fields: { endsAt: END_AFTER },
    });
    section();
    fireEvent.change(screen.getByLabelText(STARTS), {
      target: { value: "2026-11-20T17:00" },
    });
    fireEvent.change(screen.getByLabelText(ENDS), {
      target: { value: "2026-11-20T09:00" },
    });
    fireEvent.change(screen.getByLabelText(REASON), {
      target: { value: "Leave" },
    });
    fireEvent.click(screen.getByRole("button", { name: ADD }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Check the highlighted fields."
    );
    expect(screen.getByText(END_AFTER)).toBeInTheDocument();
    expect(screen.getByLabelText(ENDS)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(ENDS)).toHaveAccessibleDescription(END_AFTER);
    expect(screen.getByLabelText(STARTS)).toHaveValue("2026-11-20T17:00");
    expect(screen.getByLabelText(ENDS)).toHaveValue("2026-11-20T09:00");
    expect(screen.getByLabelText(REASON)).toHaveValue("Leave");
    expect(screen.getByLabelText(STARTS)).not.toHaveAttribute("aria-invalid");
  });

  it("shows a refusal with no field attached as a plain message", async () => {
    actions.saveTimeOffAction.mockResolvedValue({
      status: "error",
      kind: "unavailable",
      message: "We could not save that change.",
      nextStep: "Try again in a moment.",
    });
    section();
    fireEvent.change(screen.getByLabelText(STARTS), {
      target: { value: "2026-11-20T09:00" },
    });
    fireEvent.change(screen.getByLabelText(ENDS), {
      target: { value: "2026-11-20T17:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: ADD }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not save that change."
    );
    expect(screen.getByLabelText(ENDS)).toHaveValue("2026-11-20T17:00");
  });
});

describe("remove time off", () => {
  it("asks first, then removes and announces it", async () => {
    actions.removeTimeOffAction.mockResolvedValue({
      status: "success",
      message: "Time off removed.",
    });
    section({ exceptions: [exception] });
    fireEvent.click(screen.getByRole("button", { name: REMOVE_THIS }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Remove this time off?");
    expect(actions.removeTimeOffAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: CONFIRM_REMOVE }));
    expect(
      (await screen.findByText("Time off removed.")).parentElement
    ).toHaveAttribute("role", "status");
    expect(actions.removeTimeOffAction.mock.calls[0]?.[0]).toBe("sea-salt");
    expect(actions.removeTimeOffAction.mock.calls[0]?.[1]).toBe(LEAVE);
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    );
  });

  it("keeps the dialog open and explains a refused removal", async () => {
    actions.removeTimeOffAction.mockResolvedValue({
      status: "error",
      kind: "not_found",
      message: "That item no longer exists.",
      nextStep: "Reload the settings and try again.",
    });
    section({ exceptions: [exception] });
    fireEvent.click(screen.getByRole("button", { name: REMOVE_THIS }));
    fireEvent.click(
      await screen.findByRole("button", { name: CONFIRM_REMOVE })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That item no longer exists."
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("can be cancelled without calling the API", async () => {
    section({ exceptions: [exception] });
    fireEvent.click(screen.getByRole("button", { name: REMOVE_THIS }));
    fireEvent.click(await screen.findByRole("button", { name: "Keep it" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    );
    expect(actions.removeTimeOffAction).not.toHaveBeenCalled();
  });
});
