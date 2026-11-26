import type {
  BookingPublicService,
  BookingStorefront,
} from "@barrelsgd/api-client";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingFlowActions } from "../lib/booking-types";
import { BookingFlow, type BookingFlowProps } from "./booking-flow";

const CLASSIC_LASHES = /Classic lashes/u;
const BROW_SHAPING = /Brow shaping/u;
const CODE_WORD = /code/iu;

const LASHES = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f0001";
const BROWS = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f0002";
const TUE = "2027-01-05T13:30:00Z";
const TUE_GONE = "2027-01-05T14:30:00Z";
const TIME_GONE =
  "Your earlier time is no longer available. Choose another time.";
const CONTINUE = { name: "Continue" };

const loadSlots = vi.fn<BookingFlowActions["loadSlots"]>();
const actions: BookingFlowActions = {
  confirmEmailCode: vi.fn(),
  loadSlots,
  requestEmailCode: vi.fn(),
  submitBooking: vi.fn(),
};

const lashes: BookingPublicService = {
  id: LASHES,
  name: "Classic lashes",
  category: null,
  description: "Soft set.",
  duration_min: 60,
  price_minor: 7000,
  deposit_minor: 0,
};
const brows: BookingPublicService = {
  id: BROWS,
  name: "Brow shaping",
  category: null,
  description: null,
  duration_min: 30,
  price_minor: 3000,
  deposit_minor: 0,
};

const storefront: BookingStorefront = {
  slug: "choices-studio",
  display_name: "Choices Studio",
  timezone: "America/Grenada",
  currency: "XCD",
  cancel_cutoff_hours: 24,
  contact: { phone: null, whatsapp: null, instagram: null, email: null },
  providers: [],
  brand_color: null,
  logo_url: null,
  services: [lashes, brows],
};

const slots = {
  ok: true as const,
  data: {
    timezone: "America/Grenada",
    slots: [{ starts_at: TUE, ends_at: "2027-01-05T14:30:00Z" }],
  },
};

function renderFlow(props: Partial<BookingFlowProps> = {}) {
  return render(
    <BookingFlow
      actions={actions}
      managePath="/booking"
      storefront={storefront}
      studioName="Choices Studio"
      turnstileSiteKey=""
      {...props}
    />
  );
}

/** The step panes showing now (the host CSS shows only these on phones). */
function activePane(): string | undefined {
  return document.querySelector<HTMLElement>('[data-pane][data-active="true"]')
    ?.dataset.pane;
}

/** The Edit link on the chosen-so-far line, named for the step it returns to. */
function editButton(target: "service" | "time"): HTMLButtonElement {
  // Every step's panes are in the page; the phone shows only the active one.
  const found = document.querySelector<HTMLButtonElement>(
    '[data-pane][data-active="true"] .book-edit'
  );
  if (!found) {
    throw new Error("no Edit link on the chosen-so-far line");
  }
  expect(found).toHaveAccessibleName(`Edit ${target}`);
  return found;
}

function linked(): URL {
  return new URL(window.location.href);
}

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/choices-studio");
  window.sessionStorage.clear();
  loadSlots.mockResolvedValue(slots);
});

describe("choices are remembered in the link", () => {
  it("writes the chosen service into the page link as it is chosen", async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole("radio", { name: CLASSIC_LASHES }));
    expect(linked().searchParams.get("service")).toBe(LASHES);
  });

  it("writes the time once chosen, and keeps the page's other parameters", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/choices-studio?utm=spring");
    renderFlow();
    await user.click(screen.getByRole("radio", { name: CLASSIC_LASHES }));
    await user.click(screen.getByRole("button", CONTINUE));
    await user.click(await screen.findByRole("radio", { name: "9:30 am" }));
    expect(linked().searchParams.get("time")).toBe(TUE);
    expect(linked().searchParams.get("utm")).toBe("spring");
  });

  it("restores a service, day and time on load, and keeps the time", async () => {
    const user = userEvent.setup();
    renderFlow({
      initialDay: "2027-01-05",
      initialServiceId: LASHES,
      initialStartsAt: TUE,
    });
    expect(activePane()).toBe("1");
    expect(screen.getByRole("radio", { name: CLASSIC_LASHES })).toBeChecked();
    await user.click(screen.getByRole("button", CONTINUE));
    expect(await screen.findByRole("radio", { name: "9:30 am" })).toBeChecked();
    expect(loadSlots).toHaveBeenCalledWith(LASHES, "2027-01-05");
  });

  it("clears a remembered time that is no longer offered, keeps the service and says so", async () => {
    const user = userEvent.setup();
    renderFlow({
      initialDay: "2027-01-05",
      initialServiceId: LASHES,
      initialStartsAt: TUE_GONE,
    });
    await user.click(screen.getByRole("button", CONTINUE));
    expect(await screen.findByText(TIME_GONE)).toBeVisible();
    expect(screen.getByRole("radio", { name: CLASSIC_LASHES })).toBeChecked();
    expect(screen.getByRole("radio", { name: "9:30 am" })).not.toBeChecked();
    expect(screen.getByRole("button", CONTINUE)).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(linked().searchParams.has("time")).toBe(false);
  });

  it("drops the day and time when a different service is chosen", async () => {
    const user = userEvent.setup();
    renderFlow({
      initialDay: "2027-01-05",
      initialServiceId: LASHES,
      initialStartsAt: TUE,
    });
    await user.click(screen.getByRole("radio", { name: BROW_SHAPING }));
    expect(linked().searchParams.get("service")).toBe(BROWS);
    expect(linked().searchParams.has("time")).toBe(false);
    expect(linked().searchParams.has("day")).toBe(false);
  });
});

describe("Edit links on the chosen-so-far line", () => {
  it("steps 2 and 3 show the service, day and time, and Edit goes back", async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole("radio", { name: CLASSIC_LASHES }));
    await user.click(screen.getByRole("button", CONTINUE));
    expect(document.querySelector(".book-recap-trail")).toHaveTextContent(
      "Classic lashes"
    );

    await user.click(editButton("service"));
    expect(activePane()).toBe("1");
    expect(screen.getByRole("radio", { name: CLASSIC_LASHES })).toBeChecked();
  });

  it("on step 3 Edit goes back to the time, which keeps its choice", async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole("radio", { name: CLASSIC_LASHES }));
    await user.click(screen.getByRole("button", CONTINUE));
    await user.click(await screen.findByRole("radio", { name: "9:30 am" }));
    await user.click(screen.getByRole("button", CONTINUE));
    expect(activePane()).toBe("3");
    expect(document.querySelector(".book-recap-trail")).toHaveTextContent(
      "9:30 am"
    );

    await user.click(editButton("time"));
    expect(activePane()).toBe("2");
    expect(screen.getByRole("radio", { name: "9:30 am" })).toBeChecked();
  });
});

describe("typed details survive a reload or a trip to sign in", () => {
  it("restores what was typed for this business in this tab", async () => {
    const user = userEvent.setup();
    const first = renderFlow();
    await user.click(screen.getByRole("radio", { name: CLASSIC_LASHES }));
    await user.click(screen.getByRole("button", CONTINUE));
    await user.click(await screen.findByRole("radio", { name: "9:30 am" }));
    await user.click(screen.getByRole("button", CONTINUE));
    await user.type(screen.getByLabelText("Name"), "Ada");
    first.unmount();

    renderFlow({
      initialServiceId: LASHES,
      initialStartsAt: TUE,
      initialDay: "2027-01-05",
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveValue("Ada")
    );
  });

  it("never keeps the emailed code in storage", async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole("radio", { name: CLASSIC_LASHES }));
    await user.click(screen.getByRole("button", CONTINUE));
    await user.click(await screen.findByRole("radio", { name: "9:30 am" }));
    await user.click(screen.getByRole("button", CONTINUE));
    await user.type(screen.getByLabelText("Name"), "Ada");
    const stored = Object.keys(window.sessionStorage).join(" ");
    expect(stored).not.toMatch(CODE_WORD);
    expect(window.sessionStorage.length).toBeLessThanOrEqual(1);
  });
});
