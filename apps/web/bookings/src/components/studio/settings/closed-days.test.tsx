import type { BookingClosurePublic } from "@barrelsgd/api-client";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  reopenClosureAction: vi.fn(),
  saveClosureAction: vi.fn(),
}));
vi.mock("@/app/studio/[orgSlug]/settings/actions", () => actions);

import { ClosedDays } from "./closed-days";

const CHRISTMAS_ID = "66666666-6666-4666-8666-666666666666";
const ZONE = "America/Grenada";
const TODAY = "2026-11-25";
const NONE = "No closed days planned.";
const NOT_YOU = /An owner or admin can add closed days here/u;
const CHRISTMAS_SPAN = "Friday, 25 December 2026";
const START = "Start date";
const END = "End date";
const REASON = /Reason/u;
const ADD = "Add closed days";
const END_BEFORE_START = "The end date can't be before the start date.";
const NOT_CANCELLED = /They are not cancelled/u;
const REOPEN = /^Reopen/u;
const CUSTOMER_LINK = /^Customer, /u;
const ANA_LINK = /^Ana,/u;

const christmas: BookingClosurePublic = {
  id: CHRISTMAS_ID,
  starts_on: "2026-12-25",
  ends_on: "2026-12-25",
  reason: "Christmas",
  created_at: "2026-11-01T12:00:00Z",
};

function section(overrides: Partial<Parameters<typeof ClosedDays>[0]> = {}) {
  return render(
    <ClosedDays
      closures={[]}
      editable
      orgSlug="sea-salt"
      today={TODAY}
      zone={ZONE}
      {...overrides}
    />
  );
}

function fill(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("closed days list", () => {
  it("shows the empty state with the add form for an admin", () => {
    section();
    expect(screen.getByText(NONE)).toBeInTheDocument();
    expect(screen.getByLabelText(START)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ADD })).toBeEnabled();
  });

  it("lists upcoming closures with their reason and a reopen action", () => {
    section({ closures: [christmas] });
    expect(
      within(screen.getByRole("listitem")).getByText(CHRISTMAS_SPAN, {
        selector: "p",
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Christmas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: REOPEN })).toBeEnabled();
    expect(screen.queryByText(NONE)).not.toBeInTheDocument();
  });

  it("drops a closure that has already ended", () => {
    section({
      closures: [
        {
          ...christmas,
          id: "p",
          starts_on: "2026-10-01",
          ends_on: "2026-10-02",
        },
      ],
    });
    expect(screen.getByText(NONE)).toBeInTheDocument();
  });

  it("shows the empty state to a member with no form and no reopen", () => {
    section({ editable: false });
    expect(screen.getByText(NONE)).toBeInTheDocument();
    expect(screen.getByText(NOT_YOU)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("lists closures for a member without offering to change them", () => {
    section({ closures: [christmas], editable: false });
    expect(
      within(screen.getByRole("listitem")).getByText(CHRISTMAS_SPAN, {
        selector: "p",
      })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says so inline and offers no form when the closures could not be read", () => {
    section({ closures: null });
    expect(
      screen.getByText("Closed days could not be loaded. Try again later.")
    ).toBeInTheDocument();
    expect(screen.queryByText(NONE)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ADD })).not.toBeInTheDocument();
  });
});

describe("reopen", () => {
  it("asks first, then reopens and announces it", async () => {
    actions.reopenClosureAction.mockResolvedValue({
      status: "success",
      message: "Closed days reopened.",
    });
    section({ closures: [christmas] });
    fireEvent.click(screen.getByRole("button", { name: REOPEN }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Reopen these days?");
    expect(actions.reopenClosureAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reopen these days" }));
    expect(
      (await screen.findByText("Closed days reopened.")).parentElement
    ).toHaveAttribute("role", "status");
    expect(actions.reopenClosureAction.mock.calls[0]?.[0]).toBe("sea-salt");
    expect(actions.reopenClosureAction.mock.calls[0]?.[1]).toBe(CHRISTMAS_ID);
  });

  it("keeps the closure when the person chooses to keep it closed", async () => {
    section({ closures: [christmas] });
    fireEvent.click(screen.getByRole("button", { name: REOPEN }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Keep it closed" })
    );
    expect(actions.reopenClosureAction).not.toHaveBeenCalled();
  });
});

describe("add closed days", () => {
  it("defaults the end date to the start date until it is changed", () => {
    section();
    fill(START, "2026-12-24");
    expect(screen.getByLabelText(END)).toHaveValue("2026-12-24");
    fill(END, "2026-12-26");
    fill(START, "2026-12-20");
    expect(screen.getByLabelText(END)).toHaveValue("2026-12-26");
  });

  it("sends the days and reason as typed, with a null reason when blank", async () => {
    actions.saveClosureAction.mockResolvedValue({
      status: "success",
      message: "Closed days added.",
      affected: [],
    });
    section();
    fill(START, "2026-12-25");
    fill(REASON, "Christmas");
    fireEvent.click(screen.getByRole("button", { name: ADD }));

    expect(
      (await screen.findByText("Closed days added.")).parentElement
    ).toHaveAttribute("role", "status");
    await waitFor(() => expect(screen.getByLabelText(START)).toHaveValue(""));
    expect(screen.getByLabelText(END)).toHaveValue("");
    expect(screen.getByLabelText(REASON)).toHaveValue("");

    const call = actions.saveClosureAction.mock.calls[0];
    expect(call?.[0]).toBe("sea-salt");
    const body = call?.[2] as FormData;
    expect(body.get("startsOn")).toBe("2026-12-25");
    expect(body.get("endsOn")).toBe("2026-12-25");
    expect(body.get("reason")).toBe("Christmas");
  });

  it("refuses an end before the start without calling the server", () => {
    section();
    fill(START, "2026-12-25");
    fill(END, "2026-12-24");
    fireEvent.click(screen.getByRole("button", { name: ADD }));

    expect(screen.getByText(END_BEFORE_START)).toBeInTheDocument();
    expect(screen.getByLabelText(END)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(END)).toHaveAccessibleDescription(
      expect.stringContaining(END_BEFORE_START)
    );
    expect(screen.getByLabelText(START)).toHaveValue("2026-12-25");
    expect(screen.getByLabelText(END)).toHaveValue("2026-12-24");
    expect(actions.saveClosureAction).not.toHaveBeenCalled();
  });

  it("asks for a missing day without calling the server", () => {
    section();
    fireEvent.click(screen.getByRole("button", { name: ADD }));
    expect(
      screen.getByText("Choose the first closed day.")
    ).toBeInTheDocument();
    expect(actions.saveClosureAction).not.toHaveBeenCalled();
  });

  it("maps the API's 422 to the field it names and keeps what was typed", async () => {
    actions.saveClosureAction.mockResolvedValue({
      status: "error",
      kind: "invalid",
      message: "Check the highlighted fields.",
      nextStep: "Fix the highlighted fields.",
      fields: { endsOn: END_BEFORE_START },
    });
    section();
    fill(START, "2026-12-25");
    fill(END, "2026-12-26");
    fill(REASON, "Leave");
    fireEvent.click(screen.getByRole("button", { name: ADD }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Check the highlighted fields."
    );
    expect(screen.getByText(END_BEFORE_START)).toBeInTheDocument();
    expect(screen.getByLabelText(START)).toHaveValue("2026-12-25");
    expect(screen.getByLabelText(END)).toHaveValue("2026-12-26");
    expect(screen.getByLabelText(REASON)).toHaveValue("Leave");
  });

  it("shows a refusal with no field as a plain message", async () => {
    actions.saveClosureAction.mockResolvedValue({
      status: "error",
      kind: "conflict",
      message: "That change clashes with another one.",
      nextStep: "Reload the settings and try again.",
    });
    section();
    fill(START, "2026-12-25");
    fireEvent.click(screen.getByRole("button", { name: ADD }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That change clashes with another one."
    );
    expect(screen.getByLabelText(START)).toHaveValue("2026-12-25");
  });
});

describe("bookings inside a new closure", () => {
  it("lists each booking with a link into the studio and says they are not cancelled", async () => {
    actions.saveClosureAction.mockResolvedValue({
      status: "success",
      message: "Closed days added.",
      affected: [
        {
          id: "99999999-9999-4999-8999-999999999999",
          startsAt: "2026-12-25T13:00:00Z",
          customerFirstName: "Ana",
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          startsAt: "2026-12-25T15:00:00Z",
          customerFirstName: null,
        },
      ],
    });
    section();
    fill(START, "2026-12-25");
    fireEvent.click(screen.getByRole("button", { name: ADD }));

    expect(
      await screen.findByRole("heading", {
        name: "2 bookings fall on these closed days",
      })
    ).toBeInTheDocument();
    expect(screen.getByText(NOT_CANCELLED)).toBeInTheDocument();
    const first = screen.getByRole("link", {
      name: "Ana, Friday, 25 December 2026, 9:00 am",
    });
    expect(first).toHaveAttribute(
      "href",
      "/studio/sea-salt/bookings/99999999-9999-4999-8999-999999999999"
    );
    expect(screen.getByRole("link", { name: CUSTOMER_LINK })).toHaveAttribute(
      "href",
      "/studio/sea-salt/bookings/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    );
  });

  it("uses the singular wording for one booking", async () => {
    actions.saveClosureAction.mockResolvedValue({
      status: "success",
      message: "Closed days added.",
      affected: [
        {
          id: "99999999-9999-4999-8999-999999999999",
          startsAt: "2026-12-25T13:00:00Z",
          customerFirstName: "Ana",
        },
      ],
    });
    section();
    fill(START, "2026-12-25");
    fireEvent.click(screen.getByRole("button", { name: ADD }));
    expect(
      await screen.findByRole("heading", {
        name: "1 booking falls on these closed days",
      })
    ).toBeInTheDocument();
  });

  it("clears the last save's result once the person edits the form again", async () => {
    actions.saveClosureAction.mockResolvedValue({
      status: "success",
      message: "Closed days added.",
      affected: [
        {
          id: "99999999-9999-4999-8999-999999999999",
          startsAt: "2026-12-25T13:00:00Z",
          customerFirstName: "Ana",
        },
      ],
    });
    section();
    fill(START, "2026-12-25");
    fireEvent.click(screen.getByRole("button", { name: ADD }));
    expect(
      await screen.findByRole("heading", {
        name: "1 booking falls on these closed days",
      })
    ).toBeInTheDocument();

    fill(START, "2026-12-30");
    expect(screen.queryByText("Closed days added.")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "1 booking falls on these closed days",
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: ANA_LINK })
    ).not.toBeInTheDocument();
  });

  it("shows no notice when no booking falls inside the closure", async () => {
    actions.saveClosureAction.mockResolvedValue({
      status: "success",
      message: "Closed days added.",
      affected: [],
    });
    section();
    fill(START, "2026-12-25");
    fireEvent.click(screen.getByRole("button", { name: ADD }));
    await screen.findByText("Closed days added.");
    expect(screen.queryByText(NOT_CANCELLED)).not.toBeInTheDocument();
  });
});
