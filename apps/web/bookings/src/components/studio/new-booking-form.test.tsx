import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createBookingAction = vi.hoisted(() => vi.fn());
const loadWalkInTimesAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/studio/[orgSlug]/bookings/new/actions", () => ({
  createBookingAction,
  loadWalkInTimesAction,
}));

import { NewBookingForm } from "./new-booking-form";

const UUID = /^[0-9a-f-]{36}$/u;
const CLOCK = /America\/Grenada/u;
const FACIAL = /Facial/u;
const MASSAGE = /Massage/u;
const NO_TIMES_THAT_DAY = /No open times on this day for this provider/u;
const CLOSED_NOTE = /Online booking is closed, so open times are not listed/u;
const OPEN_TIMES_HEADING = /^Open times on /u;
const S1 = "44444444-4444-4444-8444-444444444444";
const S2 = "44444444-4444-4444-8444-444444445555";

function service(id: string, name: string, category: string | null = null) {
  return {
    id,
    name,
    category,
    description: null,
    duration_min: 60,
    buffer_before_min: 0,
    buffer_after_min: 0,
    price_minor: 15_000,
    deposit_minor: 2500,
    active: true,
    sort_order: 0,
  };
}

function provider(id: string, name: string, serviceIds: string[]) {
  return {
    id,
    name,
    user_id: null,
    active: true,
    sort_order: 0,
    service_ids: serviceIds,
  };
}

function renderForm(
  providers = [provider("p1", "Maya", [S1])],
  services = [service(S1, "Massage")]
) {
  return render(
    <NewBookingForm
      currency="XCD"
      orgSlug="sea-salt"
      providers={providers}
      services={services}
      today="2026-10-21"
      zone="America/Grenada"
    />
  );
}

function keyValue(): string | undefined {
  return document.querySelector<HTMLInputElement>(
    'input[name="idempotencyKey"]'
  )?.value;
}

beforeEach(() => {
  vi.clearAllMocks();
  loadWalkInTimesAction.mockResolvedValue({ status: "ready", times: [] });
});

describe("idempotency key", () => {
  it("is made on mount, so the form is submittable only after it exists", () => {
    renderForm();
    expect(keyValue()).toMatch(UUID);
  });
});

describe("service search", () => {
  it("offers only providers for the chosen service and names the clock", () => {
    renderForm(
      [provider("p1", "Maya", [S1]), provider("p2", "Kofi", [S2])],
      [service(S1, "Massage"), service(S2, "Facial")]
    );
    expect(screen.getByRole("option", { name: "Maya" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Kofi" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: FACIAL }));
    expect(screen.getByRole("option", { name: "Kofi" })).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-21");
    expect(screen.getByText(CLOCK)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save booking" })).toBeEnabled();
  });

  it("filters the service list by name or category as the person types", () => {
    renderForm(
      [provider("p1", "Maya", [S1, S2])],
      [service(S1, "Massage", "Body"), service(S2, "Facial")]
    );
    const search = screen.getByRole("searchbox", { name: "Search services" });
    fireEvent.change(search, { target: { value: "body" } });
    expect(screen.getByRole("button", { name: MASSAGE })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: FACIAL })
    ).not.toBeInTheDocument();
  });

  it("says when no service matches, and clears the search", () => {
    renderForm();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search services" }),
      {
        target: { value: "zzz" },
      }
    );
    expect(screen.getByText("No service matches “zzz”.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("button", { name: MASSAGE })).toBeInTheDocument();
  });

  it("marks the chosen service as pressed", () => {
    renderForm(
      [provider("p1", "Maya", [S1, S2])],
      [service(S1, "Massage"), service(S2, "Facial")]
    );
    expect(screen.getByRole("button", { name: MASSAGE })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: FACIAL })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });
});

describe("open times", () => {
  it("asks for the times of the chosen service, provider and day", async () => {
    renderForm();
    await waitFor(() =>
      expect(loadWalkInTimesAction).toHaveBeenCalledWith("sea-salt", {
        serviceId: S1,
        providerId: "p1",
        date: "2026-10-21",
      })
    );
  });

  it("asks once, for the last day, after a quick run of changes", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-10-22" },
    });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-10-23" },
    });
    await waitFor(() => expect(loadWalkInTimesAction).toHaveBeenCalledTimes(1));
    expect(loadWalkInTimesAction).toHaveBeenCalledWith("sea-salt", {
      serviceId: S1,
      providerId: "p1",
      date: "2026-10-23",
    });
  });

  it("shows the open times as chips and fills the start time from one", async () => {
    loadWalkInTimesAction.mockResolvedValue({
      status: "ready",
      times: [
        { time: "09:00", label: "9:00 AM" },
        { time: "09:30", label: "9:30 AM" },
      ],
    });
    renderForm();
    const chip = await screen.findByRole("button", { name: "9:30 AM" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Start time")).toHaveValue("09:30");
  });

  it("says there are no open times that day, and still takes a typed time", async () => {
    renderForm();
    expect(await screen.findByText(NO_TIMES_THAT_DAY)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Start time"), {
      target: { value: "18:15" },
    });
    expect(screen.getByLabelText("Start time")).toHaveValue("18:15");
  });

  it("says online booking is closed when the public times are not served", async () => {
    loadWalkInTimesAction.mockResolvedValue({ status: "closed" });
    renderForm();
    expect(await screen.findByText(CLOSED_NOTE)).toBeInTheDocument();
  });

  it("shows a failed read in words, not as an error page", async () => {
    loadWalkInTimesAction.mockResolvedValue({
      status: "error",
      message: "Open times could not be loaded. Type a time below instead.",
    });
    renderForm();
    expect(
      await screen.findByText(
        "Open times could not be loaded. Type a time below instead."
      )
    ).toBeInTheDocument();
  });

  it("lists the times under a heading that names the day", async () => {
    loadWalkInTimesAction.mockResolvedValue({
      status: "ready",
      times: [{ time: "10:00", label: "10:00 am" }],
    });
    renderForm();
    const chip = await screen.findByRole("button", { name: "10:00 am" });
    const section = chip.closest("section");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByRole("heading", {
        name: OPEN_TIMES_HEADING,
      })
    ).toBeInTheDocument();
  });
});

describe("new booking form", () => {
  it("keeps everything typed after a refused submit", async () => {
    createBookingAction.mockResolvedValue({
      status: "error",
      kind: "conflict",
      message: "That time is taken.",
      nextStep: "Pick another time.",
    });
    renderForm();
    fireEvent.change(screen.getByLabelText("Customer name"), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.change(screen.getByLabelText("Start time"), {
      target: { value: "10:30" },
    });
    fireEvent.change(screen.getByLabelText("Notes (optional)"), {
      target: { value: "Prefers the quiet room" },
    });
    const firstKey = keyValue();
    fireEvent.click(screen.getByRole("button", { name: "Save booking" }));
    await screen.findByText("That time is taken.");
    const sent = createBookingAction.mock.calls[0]?.[2] as FormData;
    expect(sent.get("idempotencyKey")).toBe(firstKey);
    expect(sent.get("serviceId")).toBe(S1);
    expect(sent.get("time")).toBe("10:30");
    // A refused (conflict) submit rotates the key; the retry carries the new one.
    await waitFor(() => expect(keyValue()).not.toBe(firstKey));
    fireEvent.click(screen.getByRole("button", { name: "Save booking" }));
    await waitFor(() => expect(createBookingAction).toHaveBeenCalledTimes(2));
    const retry = createBookingAction.mock.calls[1]?.[2] as FormData;
    expect(retry.get("idempotencyKey")).not.toBe(firstKey);
    expect(retry.get("idempotencyKey")).toMatch(UUID);
    expect(screen.getByLabelText("Customer name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Start time")).toHaveValue("10:30");
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue(
      "Prefers the quiet room"
    );
  });
});
