import type {
  BookingPublicDetail,
  BookingStorefront,
} from "@barrelsgd/api-client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingFlowActions } from "../lib/booking-types";
import { BookingFlow } from "./booking-flow";

const RX_1 = /You pay a deposit/u;
const RX_2 = /verification code/u;
const RX_3 = /Send EC\$53 to account 12345\./u;
const RX_4 = /Instagram @teststudio/u;
const RX_5 = /https:\/\/pay\.example\.com\/x/u;
const RX_6 = /Extra/u;
const RX_7 = /Deposit worked out on the total/u;
const RX_8 = /You pay a deposit of EC\$10 now/u;
const RX_9 = /late fee/u;
const RX_10 = /not allowed|refuse|cannot book/iu;
const RX_11 = /Please book at least/u;
const RX_12 = /first-time/u;
const RX_13 = /Call/u;

const loadSlots = vi.fn<BookingFlowActions["loadSlots"]>();
const submitBooking = vi.fn<BookingFlowActions["submitBooking"]>();
const requestEmailCode = vi.fn<BookingFlowActions["requestEmailCode"]>();
const actions: BookingFlowActions = {
  confirmEmailCode: vi.fn(),
  loadSlots,
  requestEmailCode,
  submitBooking,
};
const SERVICE_ID = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10";
const TUE = "2027-01-05T13:30:00Z";
const NO_CONTACT = {
  phone: null,
  whatsapp: null,
  instagram: null,
  email: null,
};
const HYBRID = /Hybrid/u;
const DEPOSIT_TITLE = "How to pay your deposit to Test Studio";
const DEPOSIT_AMOUNT = "Deposit to pay: EC$53";
const SERVICE_DEPOSIT = "EC$53 deposit, paid to the business";
const NOT_BARRELS = /not through Barrels/u;
const NO_INSTRUCTIONS = /has not added payment instructions/u;
const PAUSED_TITLE = "Test Studio is not taking online bookings right now";
const NEW_TAB = /\(opens in a new tab\)/u;
const REQUEST_SENT = /sent as a request/u;
const CHECK_ADDRESS = /Check the web address/u;
const NO_PAYMENT = /No payment online/u;

const AFTER_ACCEPTED =
  /EC\$53 deposit, paid to the business after your request is accepted\./u;
const slots = {
  ok: true as const,
  data: {
    timezone: "America/Grenada",
    slots: [{ starts_at: TUE, ends_at: "2027-01-05T15:45:00Z" }],
  },
};

const paused = {
  ok: false as const,
  code: "paused" as const,
  message:
    "This business is not taking online bookings right now. Please contact the business.",
};

function shop(extra: Partial<BookingStorefront> = {}, service = {}) {
  return {
    slug: "test-studio",
    display_name: "Test Studio",
    timezone: "America/Grenada",
    currency: "XCD",
    cancel_cutoff_hours: 24,
    contact: NO_CONTACT,
    providers: [],
    brand_color: null,
    logo_url: null,
    services: [
      {
        id: SERVICE_ID,
        name: "Hybrid",
        category: null,
        description: null,
        duration_min: 135,
        price_minor: 22_500,
        deposit_minor: 0,
        ...service,
      },
    ],
    ...extra,
  } satisfies BookingStorefront;
}

const businessShop = (
  extra: Partial<BookingStorefront> = {},
  service = {}
): BookingStorefront =>
  shop(
    {
      deposit_collection: "business",
      deposit_instructions: "Send EC$53 to account 12345.\nUse your name.",
      ...extra,
    },
    { deposit_to_business_minor: 5300, ...service }
  );

function renderFlow(storefront: BookingStorefront) {
  return render(
    <BookingFlow
      actions={actions}
      managePath="/booking"
      storefront={storefront}
      studioName="Test Studio"
      turnstileSiteKey=""
    />
  );
}

async function chooseSlot(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: HYBRID }));
  await user.click(await screen.findByRole("radio", { name: "9:30 am" }));
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
  await user.type(screen.getByLabelText("Email"), "ada@example.com");
  await user.click(screen.getByRole("button", { name: "Request my booking" }));
}

beforeEach(() => {
  vi.resetAllMocks();
  loadSlots.mockResolvedValue(slots);
});

describe("deposit paid to the business", () => {
  it("labels the service with its deposit and takes no online payment", async () => {
    const user = userEvent.setup();
    renderFlow(businessShop());
    expect(screen.getByText(SERVICE_DEPOSIT)).toBeVisible();
    await chooseSlot(user);
    expect(screen.queryByText(RX_1)).toBeNull();
    expect(screen.queryByText(NO_PAYMENT)).toBeNull();
    expect(screen.queryByRole("button", { name: RX_2 })).toBeNull();
  });

  it("shows the amount and the business's own instructions on the confirm step", async () => {
    const user = userEvent.setup();
    renderFlow(businessShop());
    await chooseSlot(user);
    expect(screen.getByText(DEPOSIT_AMOUNT)).toBeVisible();
    expect(screen.getByRole("heading", { name: DEPOSIT_TITLE })).toBeVisible();
    expect(screen.getByText(NOT_BARRELS)).toBeVisible();
    const text = screen.getByText(RX_3);
    // The line break the business typed is kept in the text; CSS shows it.
    expect(text.textContent).toBe(
      "Send EC$53 to account 12345.\nUse your name."
    );
    expect(text.closest("p")?.className).toContain("deposit-instructions");
    expect(screen.queryByText(CHECK_ADDRESS)).toBeNull();
  });

  it("says plainly when the business gave no instructions", async () => {
    const user = userEvent.setup();
    renderFlow(
      businessShop({
        deposit_instructions: null,
        contact: { ...NO_CONTACT, instagram: "teststudio" },
      })
    );
    await chooseSlot(user);
    expect(screen.getByText(DEPOSIT_AMOUNT)).toBeVisible();
    expect(screen.getByText(NO_INSTRUCTIONS)).toBeVisible();
    expect(screen.getByRole("link", { name: RX_4 })).toBeVisible();
  });

  it("links only plain web addresses, safely, and never renders HTML", async () => {
    const user = userEvent.setup();
    renderFlow(
      businessShop({
        deposit_instructions:
          "Pay at https://pay.example.com/x. <b>bold</b> <script>alert(1)</script> javascript:alert(1)",
      })
    );
    await chooseSlot(user);
    const link = screen.getByRole("link", {
      name: RX_5,
    });
    expect(link).toHaveAttribute("href", "https://pay.example.com/x");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(within(link).getByText(NEW_TAB)).toBeInTheDocument();
    const box = link.closest("p");
    expect(box?.querySelector("b, script")).toBeNull();
    expect(box?.textContent).toContain("<b>bold</b>");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(
      screen.getByText("Check the web address before you pay.")
    ).toBeVisible();
  });

  it("asks for the deposit again, with the total unknown, when add-ons are ticked on a rule", async () => {
    const user = userEvent.setup();
    const add = {
      id: "7a6c0a52-7c12-4c53-9e0f-9d8f2b2f0001",
      name: "Extra",
      description: null,
      duration_min: 15,
      price_minor: 1000,
      service_ids: [SERVICE_ID],
    };
    renderFlow(businessShop({ add_ons: [add] }));
    await user.click(screen.getByRole("radio", { name: HYBRID }));
    await user.click(screen.getByRole("checkbox", { name: RX_6 }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(RX_7)).toBeVisible();
    expect(screen.queryByText(DEPOSIT_AMOUNT)).toBeNull();
  });

  it("is invisible in online mode", async () => {
    const user = userEvent.setup();
    renderFlow(shop({}, { deposit_minor: 1000, due_at_booking_minor: 1000 }));
    await chooseSlot(user);
    expect(screen.queryByText(SERVICE_DEPOSIT)).toBeNull();
    expect(screen.queryByText(DEPOSIT_AMOUNT)).toBeNull();
    expect(screen.queryByText(NOT_BARRELS)).toBeNull();
    expect(screen.getByText(RX_8)).toBeVisible();
  });

  it("shows the deposit and instructions on the confirmation", async () => {
    const user = userEvent.setup();
    const made: BookingPublicDetail = {
      id: "b1",
      // Confirmed at once: this business does not accept bookings by hand.
      status: "confirmed",
      service_id: SERVICE_ID,
      service_name: "Hybrid",
      provider_id: "p1",
      provider_name: "Jeriann",
      starts_at: TUE,
      ends_at: "2027-01-05T15:45:00Z",
      timezone: "America/Grenada",
      customer_name: "Ada Lovelace",
      business_name: "Test Studio",
      price_minor: 22_500,
      deposit_minor: 0,
      currency: "XCD",
      cancel_cutoff_hours: 24,
      can_cancel: true,
      contact: NO_CONTACT,
      deposit_to_business_minor: 5300,
      deposit_instructions: "Send EC$53 to account 12345.",
      late_fee: { amount_minor: 2500, grace_min: 15 },
    };
    submitBooking.mockResolvedValue({
      ok: true,
      data: { booking: made, manageToken: "tok" },
    });
    renderFlow(businessShop());
    await chooseSlot(user);
    await fillAndSubmit(user);
    expect(await screen.findByText(DEPOSIT_AMOUNT)).toBeVisible();
    expect(screen.getByText("Send EC$53 to account 12345.")).toBeVisible();
    expect(
      screen.getByText(
        "Arriving more than 15 minutes late adds a late fee of EC$25."
      )
    ).toBeVisible();
  });
});

describe("late fee", () => {
  it("is said once beside the cancellation rule", async () => {
    const user = userEvent.setup();
    renderFlow(shop({ late_fee: { amount_minor: 2500, grace_min: 15 } }));
    await chooseSlot(user);
    expect(
      screen.getAllByText(
        "Arriving more than 15 minutes late adds a late fee of EC$25."
      )
    ).toHaveLength(1);
  });

  it("drops the grace words when there is none", async () => {
    const user = userEvent.setup();
    renderFlow(shop({ late_fee: { amount_minor: 2500, grace_min: 0 } }));
    await chooseSlot(user);
    expect(
      screen.getByText("Arriving late adds a late fee of EC$25.")
    ).toBeVisible();
  });

  it("is absent when the business has none", async () => {
    const user = userEvent.setup();
    renderFlow(shop({ late_fee: null }));
    await chooseSlot(user);
    expect(screen.queryByText(RX_9)).toBeNull();
  });
});

describe("new clients only", () => {
  const newClients = {
    new_clients_only: true,
    first_visit_lead_days: 7,
    first_visit_categories: ["lash", "brow"],
  };

  it("tags the service and notes it on selection and on the confirm step", async () => {
    const user = userEvent.setup();
    renderFlow(shop({}, newClients));
    expect(screen.getByText("New clients")).toBeVisible();
    expect(screen.queryByText(REQUEST_SENT)).toBeNull();
    await user.click(screen.getByRole("radio", { name: HYBRID }));
    expect(
      screen.getAllByText(
        "For first-time clients. Please book at least 7 days before your first lash or brow appointment."
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(REQUEST_SENT).length).toBeGreaterThan(0);
    expect(screen.queryByText(RX_10)).toBeNull();
  });

  it("shows the new-clients note once on each layout: in the chosen service's details, and on the confirm step only on phones", async () => {
    const user = userEvent.setup();
    const { container } = renderFlow(shop({}, newClients));
    await user.click(screen.getByRole("radio", { name: HYBRID }));
    const panel = container.querySelector(".service-details");
    expect(panel).toHaveTextContent("For first-time clients.");
    const notes = container.querySelectorAll(".new-clients-note");
    expect(notes).toHaveLength(1);
    expect(notes[0]?.classList.contains("book-phone-only")).toBe(true);
  });

  it("puts no stray space after an ordinary service name", () => {
    renderFlow(shop());
    expect(screen.getByText("Hybrid").textContent).toBe("Hybrid");
  });

  it("keeps the note short without lead days or categories", async () => {
    const user = userEvent.setup();
    renderFlow(shop({}, { new_clients_only: true }));
    await user.click(screen.getByRole("radio", { name: HYBRID }));
    expect(
      screen.getAllByText("For first-time clients.").length
    ).toBeGreaterThan(0);
    expect(screen.queryByText(RX_11)).toBeNull();
  });

  it("adds nothing for an ordinary service", async () => {
    const user = userEvent.setup();
    renderFlow(shop());
    expect(screen.queryByText("New clients")).toBeNull();
    await user.click(screen.getByRole("radio", { name: HYBRID }));
    expect(screen.queryByText(RX_12)).toBeNull();
  });
});

describe("paused business", () => {
  it("swaps the form for a notice with contact links when times are refused", async () => {
    const user = userEvent.setup();
    loadSlots.mockResolvedValue(paused);
    renderFlow(shop({ contact: { ...NO_CONTACT, phone: "+14735551234" } }));
    await user.click(screen.getByRole("radio", { name: HYBRID }));
    expect(
      await screen.findByRole("heading", { name: PAUSED_TITLE })
    ).toBeVisible();
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.getByRole("link", { name: RX_13 })).toBeVisible();
  });

  it("does the same when the booking itself is refused", async () => {
    const user = userEvent.setup();
    submitBooking.mockResolvedValue(paused);
    renderFlow(shop());
    await chooseSlot(user);
    await fillAndSubmit(user);
    expect(
      await screen.findByRole("heading", { name: PAUSED_TITLE })
    ).toBeVisible();
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.getByRole("heading", { name: PAUSED_TITLE })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your booking was not made and your details were not saved."
    );
  });

  it("does the same when the emailed code is refused", async () => {
    const user = userEvent.setup();
    requestEmailCode.mockResolvedValue(paused);
    renderFlow(shop({}, { deposit_minor: 1000, due_at_booking_minor: 1000 }));
    await chooseSlot(user);
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(
      screen.getByRole("button", { name: "Email me a verification code" })
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: PAUSED_TITLE })).toBeVisible()
    );
  });
});

describe("deposit paid to the business on a request", () => {
  it("confirms the request with nothing to pay yet and no instructions", async () => {
    const user = userEvent.setup();
    submitBooking.mockResolvedValue({
      ok: true,
      data: {
        manageToken: "tok",
        booking: {
          id: "b1",
          status: "pending",
          service_id: SERVICE_ID,
          service_name: "Hybrid",
          provider_id: "p1",
          provider_name: "Jeriann",
          starts_at: TUE,
          ends_at: "2027-01-05T15:45:00Z",
          timezone: "America/Grenada",
          customer_name: "Ada Lovelace",
          business_name: "Test Studio",
          price_minor: 22_500,
          deposit_minor: 0,
          currency: "XCD",
          cancel_cutoff_hours: 24,
          can_cancel: true,
          contact: NO_CONTACT,
          deposit_to_business_minor: 5300,
          deposit_instructions: null,
        },
      },
    });
    renderFlow(businessShop({}, { pay_after_acceptance: true }));
    await chooseSlot(user);
    await fillAndSubmit(user);
    expect(
      await screen.findByText(
        "Nothing to pay yet. We will email you when Test Studio accepts. You then pay a deposit of EC$53 directly to Test Studio, not through Barrels."
      )
    ).toBeVisible();
    expect(screen.queryByText(DEPOSIT_AMOUNT)).toBeNull();
    expect(screen.queryByRole("heading", { name: DEPOSIT_TITLE })).toBeNull();
  });

  const LATER =
    "Nothing to pay now. This is a request: if Test Studio accepts it, you pay a deposit of EC$53 directly to Test Studio, not through Barrels. We will email you how.";

  it("says the deposit follows acceptance and shows no payment instructions", async () => {
    const user = userEvent.setup();
    renderFlow(businessShop({}, { pay_after_acceptance: true }));
    await chooseSlot(user);
    expect(screen.getByText(LATER)).toBeVisible();
    expect(screen.getByText(AFTER_ACCEPTED)).toBeVisible();
    expect(screen.queryByRole("heading", { name: DEPOSIT_TITLE })).toBeNull();
    expect(screen.queryByText(RX_3)).toBeNull();
  });
});
