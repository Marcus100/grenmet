import type {
  BookingPublicAddOn,
  BookingStorefront,
} from "@barrelsgd/api-client";
import { render, screen, waitFor } from "@testing-library/react";
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

const MAIN = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f0001";
const OTHER = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f0002";
const TUE = "2027-01-05T13:30:00Z";
const LATER = "2027-01-05T14:00:00Z";

const STEP = /Add to your appointment/u;
const ANY_EXTRA = /Extra/u;
const YOUR_APPOINTMENT = /Your appointment:/u;
const META = /\+15 min, \+EC\$10/u;
const CLASSIC = /Classic lashes/u;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/u;
const SUBMIT = "Request my booking";
const NO_LONGER_FITS = /That time no longer fits with your add-ons/u;
const NOT_AVAILABLE = /Add-ons are not available for this booking any more/u;
const MOST = /That is the most you can add \(5\)/u;
const CHOSEN_LINE = /Classic lashes: .*9:30 am/u;

function addOn(n: number, serviceIds: string[] = [MAIN]): BookingPublicAddOn {
  return {
    id: `7a6c0a52-7c12-4c53-9e0f-9d8f2b2f000${n}`,
    name: `Extra ${n}`,
    description: null,
    duration_min: 15,
    price_minor: 1000 * n,
    service_ids: serviceIds,
  };
}

function storefront(addOns?: BookingPublicAddOn[]): BookingStorefront {
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
        id: MAIN,
        name: "Classic lashes",
        category: "Lashes",
        description: null,
        duration_min: 60,
        price_minor: 5000,
        deposit_minor: 0,
      },
    ],
    ...(addOns ? { add_ons: addOns } : {}),
  };
}

const slotList = (...starts: string[]) => ({
  ok: true as const,
  data: {
    timezone: "America/Grenada",
    slots: starts.map((starts_at) => ({
      starts_at,
      ends_at: "2027-01-05T16:00:00Z",
    })),
  },
});

const booked = {
  id: "b1",
  status: "pending" as const,
  service_id: MAIN,
  service_name: "Classic lashes",
  provider_id: "p1",
  provider_name: "Jeriann",
  starts_at: TUE,
  ends_at: "2027-01-05T15:00:00Z",
  timezone: "America/Grenada",
  customer_name: "Ada Lovelace",
  price_minor: 7000,
  deposit_minor: 0,
  currency: "XCD",
  cancel_cutoff_hours: 24,
  can_cancel: true,
  contact: NO_CONTACT,
  add_ons: [
    { name: "Extra 1", duration_min: 15, price_minor: 1000 },
    { name: "Extra 2", duration_min: 15, price_minor: 2000 },
  ],
};

function renderFlow(shown: BookingStorefront) {
  return render(
    <BookingFlow
      actions={actions}
      managePath="/booking"
      storefront={shown}
      studioName="Test Studio"
      turnstileSiteKey=""
    />
  );
}

type User = ReturnType<typeof userEvent.setup>;

async function pickService(user: User) {
  await user.click(screen.getByRole("radio", { name: CLASSIC }));
}

async function pickSlot(user: User) {
  await user.click(await screen.findByRole("radio", { name: "9:30 am" }));
}

const box = (n: number) =>
  screen.getByRole("checkbox", {
    name: (text) => text.startsWith(`Extra ${n}`),
  });

const tick = (user: User, n: number) => user.click(box(n));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadSlots).mockResolvedValue(slotList(TUE, LATER));
});

describe("add-ons on the booking form", () => {
  it("shows nothing when the business offers no add-ons", async () => {
    const user = userEvent.setup();
    renderFlow(storefront());
    await pickService(user);
    expect(screen.queryByText(STEP)).toBeNull();
    expect(screen.queryByRole("checkbox", { name: ANY_EXTRA })).toBeNull();
  });

  it("shows nothing when no add-on follows the chosen service", async () => {
    const user = userEvent.setup();
    renderFlow(storefront([addOn(1, [OTHER])]));
    await pickService(user);
    expect(screen.queryByText(STEP)).toBeNull();
  });

  it("lists one add-on with its minutes and price, after a service is chosen", async () => {
    const user = userEvent.setup();
    renderFlow(storefront([addOn(1)]));
    expect(screen.queryByText(STEP)).toBeNull();
    await pickService(user);
    expect(box(1)).not.toBeChecked();
    expect(screen.getByText(META)).toBeVisible();
    expect(screen.queryByText(YOUR_APPOINTMENT)).toBeNull();
  });

  it("updates the total and length, and asks for times with the add-on ids", async () => {
    const user = userEvent.setup();
    const one = addOn(1);
    const two = addOn(2);
    renderFlow(storefront([one, two]));
    await pickService(user);
    expect(loadSlots).toHaveBeenLastCalledWith(
      MAIN,
      expect.stringMatching(ISO_DAY)
    );
    await tick(user, 1);
    await waitFor(() =>
      expect(loadSlots).toHaveBeenLastCalledWith(
        MAIN,
        expect.stringMatching(ISO_DAY),
        [one.id]
      )
    );
    expect(
      screen.getByText("Your appointment: 1 hr 15 min, EC$60 in total.")
    ).toBeVisible();
    await tick(user, 2);
    await waitFor(() =>
      expect(loadSlots).toHaveBeenLastCalledWith(
        MAIN,
        expect.stringMatching(ISO_DAY),
        [one.id, two.id]
      )
    );
    expect(
      screen.getByText("Your appointment: 1 hr 30 min, EC$80 in total.")
    ).toBeVisible();
    await tick(user, 1);
    expect(
      screen.getByText("Your appointment: 1 hr 15 min, EC$70 in total.")
    ).toBeVisible();
  });

  it("stops at five add-ons and frees a box when one is unticked", async () => {
    const user = userEvent.setup();
    renderFlow(
      storefront([addOn(1), addOn(2), addOn(3), addOn(4), addOn(5), addOn(6)])
    );
    await pickService(user);
    for (const n of [1, 2, 3, 4, 5]) {
      await tick(user, n);
    }
    expect(box(6)).toBeDisabled();
    expect(screen.getByText(MOST)).toBeVisible();
    await tick(user, 5);
    expect(box(6)).toBeEnabled();
    expect(screen.queryByText(MOST)).toBeNull();
  });

  it("clears a chosen time that no longer fits and says why", async () => {
    const user = userEvent.setup();
    renderFlow(storefront([addOn(1)]));
    await pickService(user);
    await pickSlot(user);
    expect(screen.getByText(CHOSEN_LINE)).toBeVisible();
    vi.mocked(loadSlots).mockResolvedValue(slotList(LATER));
    await tick(user, 1);
    expect(await screen.findByText(NO_LONGER_FITS)).toBeVisible();
    expect(screen.queryByText(CHOSEN_LINE)).toBeNull();
    expect(screen.getByRole("radio", { name: "10:00 am" })).not.toBeChecked();
  });

  it("keeps a chosen time that still fits, with no message", async () => {
    const user = userEvent.setup();
    renderFlow(storefront([addOn(1)]));
    await pickService(user);
    await pickSlot(user);
    await tick(user, 1);
    await waitFor(() => expect(loadSlots).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(NO_LONGER_FITS)).toBeNull();
    expect(screen.getByText(CHOSEN_LINE)).toBeVisible();
  });

  it("sends the chosen add-on ids when booking, and lists them on the confirmation", async () => {
    const user = userEvent.setup();
    const one = addOn(1);
    const two = addOn(2);
    renderFlow(storefront([one, two]));
    vi.mocked(submitBooking).mockResolvedValue({
      ok: true,
      data: { booking: booked, manageToken: "tok" },
    });
    await pickService(user);
    await tick(user, 1);
    await tick(user, 2);
    await pickSlot(user);
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: SUBMIT }));
    await waitFor(() => expect(submitBooking).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitBooking).mock.calls[0]?.[0]).toMatchObject({
      addOnIds: [one.id, two.id],
      serviceId: MAIN,
    });
    expect(await screen.findByText("Extra 1: +15 min, +EC$10")).toBeVisible();
    expect(screen.getByText("Extra 2: +15 min, +EC$20")).toBeVisible();
    expect(screen.getByText("Total")).toBeVisible();
    expect(screen.getByText("EC$70")).toBeVisible();
  });

  it("does not send add-ons when none were chosen", async () => {
    const user = userEvent.setup();
    renderFlow(storefront([addOn(1)]));
    vi.mocked(submitBooking).mockResolvedValue({
      ok: true,
      data: { booking: { ...booked, add_ons: [] }, manageToken: "tok" },
    });
    await pickService(user);
    await pickSlot(user);
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: SUBMIT }));
    await waitFor(() => expect(submitBooking).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitBooking).mock.calls[0]?.[0]).not.toHaveProperty(
      "addOnIds"
    );
  });

  it("drops the add-ons and says so when the booking is refused with 422", async () => {
    const user = userEvent.setup();
    renderFlow(storefront([addOn(1)]));
    vi.mocked(submitBooking).mockResolvedValue({
      ok: false,
      code: "add_ons_unavailable",
      message:
        "Add-ons are not available for this booking any more, so we removed them. Check the total, pick a time again, then book.",
    });
    await pickService(user);
    await tick(user, 1);
    await pickSlot(user);
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: SUBMIT }));
    expect((await screen.findAllByText(NOT_AVAILABLE)).length).toBeGreaterThan(
      0
    );
    expect(screen.queryByText(STEP)).toBeNull();
    expect(screen.queryByText(CHOSEN_LINE)).toBeNull();
    // Times are loaded again without add-ons, so the customer can book the service alone.
    await waitFor(() =>
      expect(loadSlots).toHaveBeenLastCalledWith(
        MAIN,
        expect.stringMatching(ISO_DAY)
      )
    );
  });

  it("drops the add-ons when the times request is refused with 422", async () => {
    const user = userEvent.setup();
    renderFlow(storefront([addOn(1)]));
    await pickService(user);
    vi.mocked(loadSlots).mockResolvedValueOnce({
      ok: false,
      code: "add_ons_unavailable",
      message:
        "Add-ons are not available for this booking any more, so we removed them. Check the total, pick a time again, then book.",
    });
    await tick(user, 1);
    expect(await screen.findAllByText(NOT_AVAILABLE)).not.toHaveLength(0);
    await waitFor(() => expect(screen.queryByText(STEP)).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "9:30 am" })).toBeVisible()
    );
  });
});
