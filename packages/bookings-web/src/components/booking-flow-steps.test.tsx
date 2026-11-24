import type {
  BookingPublicAddOn,
  BookingStorefront,
} from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingFlowActions } from "../lib/booking-types";
import { BookingFlow } from "./booking-flow";

const loadSlots = vi.fn<BookingFlowActions["loadSlots"]>();
const submitBooking = vi.fn<BookingFlowActions["submitBooking"]>();
const actions: BookingFlowActions = {
  confirmEmailCode: vi.fn(),
  loadSlots,
  requestEmailCode: vi.fn(),
  submitBooking,
};
const NO_CONTACT = {
  phone: null,
  whatsapp: null,
  instagram: null,
  email: null,
};

const LASHES = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f0001";
const BROWS = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f0002";
const TUE = "2027-01-05T13:30:00Z";
const SLOT_TAKEN = "That time has just been taken. Please choose another.";
const LASHES_NAME = /Classic lashes/u;
const BROWS_NAME = /Brow shaping/u;
const CONTINUE = { name: "Continue" };
const BOOK = { name: "Request my booking" };
const CHOOSE_SERVICE = /Choose a service to continue/u;
const CHOOSE_TIME = /Choose a day and time to continue/u;
const RECAP_LASHES = /Classic lashes · EC\$70/u;
const RECAP_TIME = /Classic lashes · .*9:30 am · EC\$70/u;
const EXTRA_LASH = /Extra lash/u;
const RECAP_BROWS = /Brow shaping · EC\$30/u;
const RECAP_WITH_EXTRA = /Classic lashes · EC\$80/u;

const addOn: BookingPublicAddOn = {
  id: "7a6c0a52-7c12-4c53-9e0f-9d8f2b2f0001",
  name: "Extra lash",
  description: null,
  duration_min: 15,
  price_minor: 1000,
  service_ids: [LASHES],
};

function shop(addOns?: BookingPublicAddOn[]): BookingStorefront {
  return {
    slug: "babydoll-test",
    display_name: "Babydoll Test",
    timezone: "America/Grenada",
    currency: "XCD",
    cancel_cutoff_hours: 24,
    contact: NO_CONTACT,
    providers: [],
    brand_color: null,
    logo_url: null,
    services: [
      {
        id: LASHES,
        name: "Classic lashes",
        category: null,
        description: null,
        duration_min: 60,
        price_minor: 7000,
        deposit_minor: 0,
      },
      {
        id: BROWS,
        name: "Brow shaping",
        category: null,
        description: null,
        duration_min: 30,
        price_minor: 3000,
        deposit_minor: 0,
      },
    ],
    ...(addOns ? { add_ons: addOns } : {}),
  };
}

const slots = {
  ok: true as const,
  data: {
    timezone: "America/Grenada",
    slots: [{ starts_at: TUE, ends_at: "2027-01-05T14:30:00Z" }],
  },
};

function renderFlow(
  shown = shop(),
  initialServiceId?: string,
  turnstileSiteKey = ""
) {
  return render(
    <BookingFlow
      actions={actions}
      initialServiceId={initialServiceId}
      managePath="/booking"
      storefront={shown}
      studioName="Test Studio"
      turnstileSiteKey={turnstileSiteKey}
    />
  );
}

/** Pretends the screen is a phone, for the parts that act only there. */
function onAPhone() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true }))
  );
}

type User = ReturnType<typeof userEvent.setup>;

/** The step panes that are the current step (the host CSS shows only these on phones). */
function activePanes(): string[] {
  return [...document.querySelectorAll<HTMLElement>("[data-pane]")]
    .filter((pane) => pane.dataset.active === "true")
    .map((pane) => pane.dataset.pane ?? "")
    .filter((step, index, all) => all.indexOf(step) === index);
}

const heading = (text: string) =>
  screen.getByRole("heading", { name: text, level: 2 });

async function chooseLashes(user: User) {
  await user.click(screen.getByRole("radio", { name: LASHES_NAME }));
}

async function chooseTime(user: User) {
  await user.click(await screen.findByRole("radio", { name: "9:30 am" }));
}

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, "");
  vi.mocked(loadSlots).mockResolvedValue(slots);
});

describe("phone steps", () => {
  it("starts on the service step with Continue explained and unavailable", () => {
    renderFlow();
    expect(heading("Step 1 of 3: Service")).toBeInTheDocument();
    expect(activePanes()).toEqual(["1"]);
    const next = screen.getByRole("button", CONTINUE);
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(next).toHaveAccessibleDescription(CHOOSE_SERVICE);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getByText("No service chosen yet")).toBeInTheDocument();
  });

  it("marks the current step in the progress list", () => {
    renderFlow();
    const items = screen
      .getAllByRole("listitem")
      .filter((li) => li.classList.contains("book-dot"));
    expect(items).toHaveLength(3);
    expect(items.map((li) => li.getAttribute("aria-current"))).toEqual([
      "step",
      null,
      null,
    ]);
  });

  it("goes to the time step on choosing a service, then gates on a time", async () => {
    const user = userEvent.setup();
    renderFlow();
    await chooseLashes(user);

    expect(heading("Step 2 of 3: Time")).toBeInTheDocument();
    expect(activePanes()).toEqual(["2"]);
    expect(screen.getByText(RECAP_LASHES)).toBeInTheDocument();
    const next = screen.getByRole("button", CONTINUE);
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(next).toHaveAccessibleDescription(CHOOSE_TIME);
    await user.click(next);
    expect(activePanes()).toEqual(["2"]);

    await chooseTime(user);
    expect(screen.getByText(RECAP_TIME)).toBeInTheDocument();
    expect(screen.getByRole("button", CONTINUE)).toHaveAttribute(
      "aria-disabled",
      "false"
    );
    await user.click(screen.getByRole("button", CONTINUE));

    expect(heading("Step 3 of 3: Details")).toBeInTheDocument();
    expect(activePanes()).toEqual(["3"]);
    expect(screen.queryByRole("button", CONTINUE)).toBeNull();
    expect(screen.getByText(RECAP_TIME)).toBeInTheDocument();
  });

  it("has exactly one Book button, on every step", async () => {
    const user = userEvent.setup();
    renderFlow();
    expect(screen.getAllByRole("button", BOOK)).toHaveLength(1);
    await chooseLashes(user);
    expect(screen.getAllByRole("button", BOOK)).toHaveLength(1);
    await chooseTime(user);
    await user.click(screen.getByRole("button", CONTINUE));
    const books = screen.getAllByRole("button", BOOK);
    expect(books).toHaveLength(1);
    expect(books[0]).toBeEnabled();
  });

  it("keeps every choice when going Back", async () => {
    const user = userEvent.setup();
    renderFlow();
    await chooseLashes(user);
    await chooseTime(user);
    await user.click(screen.getByRole("button", CONTINUE));
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(heading("Step 2 of 3: Time")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "9:30 am" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(heading("Step 1 of 3: Service")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: LASHES_NAME })).toBeChecked();
    expect(screen.getByRole("button", CONTINUE)).toHaveAttribute(
      "aria-disabled",
      "false"
    );

    await user.click(screen.getByRole("button", CONTINUE));
    expect(screen.getByRole("radio", { name: "9:30 am" })).toBeChecked();
    await user.click(screen.getByRole("button", CONTINUE));
    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
  });

  it("stays on the service step until Continue when add-ons are offered", async () => {
    const user = userEvent.setup();
    renderFlow(shop([addOn]));
    await chooseLashes(user);
    expect(heading("Step 1 of 3: Service")).toBeInTheDocument();
    expect(activePanes()).toEqual(["1"]);
    await user.click(screen.getByRole("checkbox", { name: EXTRA_LASH }));
    expect(screen.getByText(RECAP_WITH_EXTRA)).toBeInTheDocument();
    await user.click(screen.getByRole("button", CONTINUE));
    expect(heading("Step 2 of 3: Time")).toBeInTheDocument();
  });

  it("returns to the time step with the message when the time was taken", async () => {
    const user = userEvent.setup();
    submitBooking.mockResolvedValue({
      ok: false,
      code: "slot_taken",
      message: SLOT_TAKEN,
    });
    renderFlow();
    await chooseLashes(user);
    await chooseTime(user);
    await user.click(screen.getByRole("button", CONTINUE));
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", BOOK));

    expect(await screen.findByText(SLOT_TAKEN)).toBeVisible();
    await waitFor(() => expect(activePanes()).toEqual(["2"]));
    expect(heading("Step 2 of 3: Time")).toBeInTheDocument();
    // What was typed is kept for when they come back.
    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
  });

  it("announces the step politely", async () => {
    const user = userEvent.setup();
    renderFlow();
    const live = document.querySelector<HTMLElement>(
      '[aria-live="polite"].book-sr-only'
    );
    if (!live) {
      throw new Error("no polite step announcement");
    }
    expect(live).toHaveTextContent("Step 1 of 3: Service");
    expect(live).toHaveAttribute("aria-live", "polite");
    await chooseLashes(user);
    expect(live).toHaveTextContent("Step 2 of 3: Time");
  });

  it("moves focus to the step heading on a phone-sized screen", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true }))
    );
    try {
      renderFlow();
      await chooseLashes(user);
      await waitFor(() => expect(heading("Step 2 of 3: Time")).toHaveFocus());
      expect(heading("Step 2 of 3: Time")).toHaveAttribute("tabindex", "-1");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("leaves focus alone when the screen is not a phone", async () => {
    const user = userEvent.setup();
    renderFlow();
    await chooseLashes(user);
    expect(heading("Step 2 of 3: Time")).not.toHaveFocus();
  });

  it("marks the phone-only controls so laptops never show them", () => {
    renderFlow();
    expect(
      heading("Step 1 of 3: Service").closest(".book-phone-only")
    ).not.toBeNull();
    expect(
      screen.getByRole("button", CONTINUE).closest(".book-phone-only")
    ).not.toBeNull();
    expect(screen.getByRole("form")).toHaveAttribute("data-steps", "on");
  });
});

describe("?service= preselect", () => {
  it("starts on the time step with the service in the summary and a way back", async () => {
    const user = userEvent.setup();
    renderFlow(shop(), BROWS);
    expect(heading("Step 2 of 3: Time")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: BROWS_NAME })).toBeChecked();
    expect(screen.getByText(RECAP_BROWS)).toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: "9:30 am" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(heading("Step 1 of 3: Service")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: BROWS_NAME })).toBeChecked();
  });

  it.each([
    ["an unknown id", "11111111-2222-4333-8444-555555555555"],
    ["a malformed id", "not-an-id"],
    ["an empty id", ""],
  ])("ignores %s and starts at step 1", (_label, id) => {
    renderFlow(shop(), id);
    expect(heading("Step 1 of 3: Service")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: LASHES_NAME })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: BROWS_NAME })).not.toBeChecked();
  });
});

describe("step direction", () => {
  const form = () => screen.getByRole("form");

  it("is unset on load, forward after Continue, back after Back", async () => {
    const user = userEvent.setup();
    renderFlow();
    expect(form()).not.toHaveAttribute("data-direction");
    await chooseLashes(user);
    expect(form()).toHaveAttribute("data-direction", "forward");
    await chooseTime(user);
    await user.click(screen.getByRole("button", CONTINUE));
    expect(form()).toHaveAttribute("data-direction", "forward");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(form()).toHaveAttribute("data-direction", "back");
  });

  it("is back when an error returns the person to the time step", async () => {
    const user = userEvent.setup();
    submitBooking.mockResolvedValue({
      ok: false,
      code: "slot_taken",
      message: SLOT_TAKEN,
    });
    renderFlow();
    await chooseLashes(user);
    await chooseTime(user);
    await user.click(screen.getByRole("button", CONTINUE));
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    expect(form()).toHaveAttribute("data-direction", "forward");
    await user.click(screen.getByRole("button", BOOK));
    await waitFor(() => expect(activePanes()).toEqual(["2"]));
    expect(form()).toHaveAttribute("data-direction", "back");
  });
});

const confirmedBooking = {
  id: "b1",
  status: "pending" as const,
  service_id: LASHES,
  service_name: "Classic lashes",
  provider_id: "p1",
  provider_name: "Jeriann",
  starts_at: TUE,
  ends_at: "2027-01-05T14:30:00Z",
  timezone: "America/Grenada",
  customer_name: "Ada Lovelace",
  price_minor: 7000,
  deposit_minor: 0,
  currency: "XCD",
  cancel_cutoff_hours: 24,
  can_cancel: true,
  contact: NO_CONTACT,
};

const PAYLOAD_KEYS = [
  "email",
  "idempotencyKey",
  "marketingConsent",
  "name",
  "notes",
  "phone",
  "serviceId",
  "startsAt",
  "turnstileToken",
  "website",
];

async function reachDetails(user: User) {
  await chooseLashes(user);
  await chooseTime(user);
  await user.click(screen.getByRole("button", CONTINUE));
  await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
  await user.type(screen.getByLabelText("Email"), "ada@example.com");
}

describe("phone path to a booking", () => {
  it("sends one booking with the usual payload", async () => {
    const user = userEvent.setup();
    submitBooking.mockResolvedValue({
      ok: true,
      data: {
        booking: {
          id: "b1",
          status: "pending",
          service_id: LASHES,
          service_name: "Classic lashes",
          provider_id: "p1",
          provider_name: "Jeriann",
          starts_at: TUE,
          ends_at: "2027-01-05T14:30:00Z",
          timezone: "America/Grenada",
          customer_name: "Ada Lovelace",
          price_minor: 7000,
          deposit_minor: 0,
          currency: "XCD",
          cancel_cutoff_hours: 24,
          can_cancel: true,
          contact: NO_CONTACT,
        },
        manageToken: "tok",
      },
    });
    renderFlow();
    await reachDetails(user);
    await user.click(screen.getByRole("button", BOOK));
    await screen.findByRole("heading", { name: "Thank you, Ada" });
    expect(submitBooking).toHaveBeenCalledTimes(1);
    const sent = submitBooking.mock.calls[0]?.[0];
    expect(Object.keys(sent ?? {}).sort()).toEqual(PAYLOAD_KEYS);
    expect(sent).toMatchObject({
      serviceId: LASHES,
      startsAt: TUE,
      name: "Ada Lovelace",
      email: "ada@example.com",
      marketingConsent: false,
      website: "",
    });
  });

  it("does nothing when a disabled Continue is pressed", async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole("button", CONTINUE));
    expect(heading("Step 1 of 3: Service")).toBeInTheDocument();
    expect(activePanes()).toEqual(["1"]);
  });

  it("shows the email-code request on step 3 when the API wants a code", async () => {
    const user = userEvent.setup();
    submitBooking.mockResolvedValue({
      ok: false,
      code: "email_unverified",
      message: "We need to confirm your email again.",
    });
    renderFlow();
    await reachDetails(user);
    await user.click(screen.getByRole("button", BOOK));
    expect(
      await screen.findByText("We need to confirm your email again.")
    ).toBeVisible();
    expect(activePanes()).toEqual(["3"]);
    expect(
      screen.getByRole("button", { name: "Email me a verification code" })
    ).toBeInTheDocument();
  });

  it.each([
    ["rate_limited", "Too many tries. Please wait a few minutes."],
    ["invalid", "Please check your details and try again."],
  ] as const)(
    "keeps step 3 and shows the summary for %s",
    async (code, message) => {
      const user = userEvent.setup();
      submitBooking.mockResolvedValue({ ok: false, code, message });
      renderFlow();
      await reachDetails(user);
      await user.click(screen.getByRole("button", BOOK));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(activePanes()).toEqual(["3"]);
      expect(heading("Step 3 of 3: Details")).toBeInTheDocument();
    }
  );

  it("returns to the time step with the message when add-ons are gone", async () => {
    const user = userEvent.setup();
    const message = "Add-ons are not available for this booking any more.";
    submitBooking.mockResolvedValue({
      ok: false,
      code: "add_ons_unavailable",
      message,
    });
    renderFlow(shop([addOn]));
    await chooseLashes(user);
    await user.click(screen.getByRole("checkbox", { name: EXTRA_LASH }));
    await user.click(screen.getByRole("button", CONTINUE));
    await chooseTime(user);
    await user.click(screen.getByRole("button", CONTINUE));
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", BOOK));
    expect((await screen.findAllByText(message)).length).toBeGreaterThan(0);
    await waitFor(() => expect(activePanes()).toEqual(["2"]));
  });
});

describe("implicit submit on a phone", () => {
  it("moves to the next step instead of validating hidden fields", async () => {
    const user = userEvent.setup();
    onAPhone();
    try {
      renderFlow(shop([addOn]));
      fireEvent.submit(screen.getByRole("form"));
      expect(activePanes()).toEqual(["1"]);
      expect(screen.queryByRole("alert")).toBeNull();

      await chooseLashes(user);
      expect(activePanes()).toEqual(["1"]);
      fireEvent.submit(screen.getByRole("form"));
      expect(await screen.findByText(RECAP_LASHES)).toBeInTheDocument();
      expect(activePanes()).toEqual(["2"]);
      expect(screen.queryByRole("alert")).toBeNull();

      fireEvent.submit(screen.getByRole("form"));
      expect(activePanes()).toEqual(["2"]);
      expect(submitBooking).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Turnstile placement", () => {
  const widget = { remove: vi.fn(), render: vi.fn(() => "w1"), reset: vi.fn() };

  it("is rendered on every step, never inside a hidden pane", async () => {
    const user = userEvent.setup();
    window.turnstile = widget;
    try {
      renderFlow(shop(), undefined, "site-key");
      const box = () => {
        const found = document.querySelector<HTMLElement>(".book-turnstile");
        if (!found) {
          throw new Error("no Turnstile container");
        }
        return found;
      };
      expect(box().closest(".book-pane")).toBeNull();
      expect(box()).toHaveAttribute("data-hidden", "true");
      await chooseLashes(user);
      expect(box().closest(".book-pane")).toBeNull();
      expect(box()).toHaveAttribute("data-hidden", "true");
      await chooseTime(user);
      await user.click(screen.getByRole("button", CONTINUE));
      expect(box().closest(".book-pane")).toBeNull();
      expect(box()).toHaveAttribute("data-hidden", "false");
      expect(widget.render).toHaveBeenCalledTimes(1);
    } finally {
      window.turnstile = undefined;
    }
  });
});

describe("browser Back on a phone", () => {
  it("steps back through the flow and keeps what was chosen", async () => {
    const user = userEvent.setup();
    onAPhone();
    try {
      renderFlow();
      await chooseLashes(user);
      expect(window.history.state).toEqual({ bookingStep: 2 });
      await chooseTime(user);
      await user.click(screen.getByRole("button", CONTINUE));
      expect(window.history.state).toEqual({ bookingStep: 3 });
      await user.type(screen.getByLabelText("Name"), "Ada");

      window.history.back();
      await waitFor(() => expect(activePanes()).toEqual(["2"]));
      expect(screen.getByRole("radio", { name: "9:30 am" })).toBeChecked();
      expect(document.querySelector("form")).toHaveAttribute(
        "data-direction",
        "back"
      );

      await user.click(screen.getByRole("button", { name: "Back" }));
      await waitFor(() => expect(activePanes()).toEqual(["1"]));
      expect(screen.getByRole("radio", { name: LASHES_NAME })).toBeChecked();
      await user.click(screen.getByRole("button", CONTINUE));
      await user.click(screen.getByRole("button", CONTINUE));
      expect(screen.getByLabelText("Name")).toHaveValue("Ada");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("clears a stale step entry left by a reload", () => {
    onAPhone();
    try {
      window.history.replaceState({ bookingStep: 3 }, "");
      renderFlow();
      expect(window.history.state).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns history to where the flow began after a booking", async () => {
    const user = userEvent.setup();
    onAPhone();
    submitBooking.mockResolvedValue({
      ok: true,
      data: { booking: confirmedBooking, manageToken: "tok" },
    });
    try {
      renderFlow();
      await reachDetails(user);
      expect(window.history.state).toEqual({ bookingStep: 3 });
      await user.click(screen.getByRole("button", BOOK));
      await screen.findByRole("heading", { name: "Thank you, Ada" });
      await waitFor(() => expect(window.history.state).toBeNull());
      expect(submitBooking).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("heading", { name: "Thank you, Ada" })
      ).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("adds no history entries away from a phone", async () => {
    const user = userEvent.setup();
    const before = window.history.length;
    renderFlow();
    await chooseLashes(user);
    await chooseTime(user);
    await user.click(screen.getByRole("button", CONTINUE));
    expect(window.history.length).toBe(before);
  });

  it("keeps showing the confirmation when Back is pressed after booking", async () => {
    const user = userEvent.setup();
    onAPhone();
    submitBooking.mockResolvedValue({
      ok: true,
      data: {
        booking: {
          id: "b1",
          status: "pending",
          service_id: LASHES,
          service_name: "Classic lashes",
          provider_id: "p1",
          provider_name: "Jeriann",
          starts_at: TUE,
          ends_at: "2027-01-05T14:30:00Z",
          timezone: "America/Grenada",
          customer_name: "Ada Lovelace",
          price_minor: 7000,
          deposit_minor: 0,
          currency: "XCD",
          cancel_cutoff_hours: 24,
          can_cancel: true,
          contact: NO_CONTACT,
        },
        manageToken: "tok",
      },
    });
    try {
      renderFlow();
      await reachDetails(user);
      await user.click(screen.getByRole("button", BOOK));
      await screen.findByRole("heading", { name: "Thank you, Ada" });
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(
        screen.getByRole("heading", { name: "Thank you, Ada" })
      ).toBeInTheDocument();
      expect(screen.queryByLabelText("Name")).toBeNull();
      expect(submitBooking).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("service links and disappearing services", () => {
  it("starts at step 1 for a linked service that has add-ons", () => {
    renderFlow(shop([addOn]), LASHES);
    expect(heading("Step 1 of 3: Service")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: LASHES_NAME })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: EXTRA_LASH })
    ).toBeInTheDocument();
  });

  it("goes back to step 1 when the chosen service is no longer offered", async () => {
    const user = userEvent.setup();
    const view = renderFlow();
    await chooseLashes(user);
    expect(activePanes()).toEqual(["2"]);
    const without = shop();
    without.services = without.services.filter((s) => s.id !== LASHES);
    view.rerender(
      <BookingFlow
        actions={actions}
        managePath="/booking"
        storefront={without}
        studioName="Test Studio"
        turnstileSiteKey=""
      />
    );
    await waitFor(() => expect(activePanes()).toEqual(["1"]));
    expect(heading("Step 1 of 3: Service")).toBeInTheDocument();
  });
});
