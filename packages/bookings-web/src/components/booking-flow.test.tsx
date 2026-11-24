import type { BookingStorefront } from "@barrelsgd/api-client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
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
const STUDIO = "Test Studio";
const NO_CONTACT = {
  phone: null,
  whatsapp: null,
  instagram: null,
  email: null,
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/u;
const ANY_PAY_NOW = /You pay/u;
const PAY_FULL = /You pay the full price, EC\$/u;
const PAY_DEPOSIT = /You pay a deposit of EC\$10 now/u;
const NO_TIMES = /No times are open/u;
const NOTHING_LOST = /Nothing was lost/u;
const CHOSEN_HYBRID = /Hybrid: .*9:30 am/u;
const WILL_CONFIRM = /studio will confirm it by email/u;
const HYBRID = /Hybrid/u;
const A_TIME = /\d:\d\d [ap]m/u;
const HONEYPOT_LABEL = /Leave this field empty/u;
const SERVICE_ID = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10";
const TUE = "2027-01-05T13:30:00Z";
const SLOT_TAKEN = "That time has just been taken. Please choose another.";
const ONE_HOUR_CUTOFF = /Change or cancel online up to 1 hour before/u;
const CONTACT_DIRECTLY = /Please contact the business directly\./u;
const CONTACT_COLON = /Please contact the business:/u;
const CONTACT_LIST = /contact/iu;
const INSTAGRAM_LINK = /Instagram @teststudio/u;
const KEEP_BOOKINGS = /Keep your bookings in one place/u;
const MY_BOOKINGS =
  /your bookings with them, including this one, are listed under My bookings/u;
const NEVER_NEEDS = /Booking never needs an account/u;
const DATE_RANGE = /^\w{3} \d{1,2} \w{3} to \w{3} \d{1,2} \w{3}$/u;
const EMAIL_ERROR = /Enter a valid email address/u;
const HELD_WHILE_PAYING = /Your time is held while you pay/u;
const NO_PAYMENT = /No payment online\. You pay when you visit\./u;
const CANCEL_RULE =
  /No deposit for this service\. Change or cancel online up to 24 hours before; after that, contact Test Studio\./u;
const CONSULTATION = /Note for Hybrid: Consultation required/u;
const NOTE_PREFIX = /^Note for /u;

const storefront: BookingStorefront = {
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
      category: "Lashes",
      description: null,
      duration_min: 135,
      price_minor: 22_500,
      deposit_minor: 0,
    },
  ],
};

const slots = {
  ok: true as const,
  data: {
    timezone: "America/Grenada",
    slots: [
      { starts_at: TUE, ends_at: "2027-01-05T15:45:00Z" },
      { starts_at: "2027-01-05T14:00:00Z", ends_at: "2027-01-05T16:15:00Z" },
      { starts_at: "2027-01-06T13:30:00Z", ends_at: "2027-01-06T15:45:00Z" },
    ],
  },
};

const booking = {
  id: "b1",
  status: "pending" as const,
  service_id: SERVICE_ID,
  service_name: "Hybrid",
  provider_id: "p1",
  provider_name: "Jeriann",
  starts_at: TUE,
  ends_at: "2027-01-05T15:45:00Z",
  timezone: "America/Grenada",
  customer_name: "Ada Lovelace",
  price_minor: 22_500,
  deposit_minor: 0,
  currency: "XCD",
  cancel_cutoff_hours: 24,
  can_cancel: true,
  contact: NO_CONTACT,
};

function renderFlow(
  siteKey = "",
  shown: BookingStorefront = storefront,
  accountInvite?: { href: string }
) {
  return render(
    <BookingFlow
      accountInvite={accountInvite}
      actions={actions}
      managePath="/booking"
      storefront={shown}
      studioName={STUDIO}
      turnstileSiteKey={siteKey}
    />
  );
}

async function chooseSlot(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: HYBRID }));
  await user.click(await screen.findByRole("radio", { name: "9:30 am" }));
}

async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
  await user.type(screen.getByLabelText("Email"), "ada@example.com");
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadSlots).mockResolvedValue(slots);
});

describe("BookingFlow slot picker", () => {
  it("lists services, then days and times from the availability", async () => {
    const user = userEvent.setup();
    renderFlow();
    expect(
      screen.getByText("Choose a service to see open times.")
    ).toBeVisible();
    await user.click(screen.getByRole("radio", { name: HYBRID }));

    expect(
      await screen.findByRole("radio", { name: "Tue 5 Jan" })
    ).toBeChecked();
    expect(screen.getByRole("radio", { name: "Wed 6 Jan" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "9:30 am" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "10:00 am" })).toBeInTheDocument();
    expect(loadSlots).toHaveBeenCalledWith(
      SERVICE_ID,
      expect.stringMatching(ISO_DAY)
    );

    await user.click(screen.getByRole("radio", { name: "Wed 6 Jan" }));
    expect(screen.getAllByRole("radio", { name: A_TIME })).toHaveLength(1);
  });

  it("says so when no times are open and when loading fails", async () => {
    const user = userEvent.setup();
    vi.mocked(loadSlots).mockResolvedValueOnce({
      ok: true,
      data: { timezone: "America/Grenada", slots: [] },
    });
    renderFlow();
    await user.click(screen.getByRole("radio", { name: HYBRID }));
    expect(await screen.findByText(NO_TIMES)).toBeVisible();

    vi.mocked(loadSlots).mockRejectedValueOnce(new Error("offline"));
    await user.click(screen.getByRole("button", { name: "Later dates" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't load times"
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("radio", { name: "Tue 5 Jan" })
    ).toBeVisible();
  });
});

describe("BookingFlow form", () => {
  it("shows an error summary and sends nothing when the form is empty", async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(
      screen.getByRole("button", { name: "Request my booking" })
    );

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveFocus();
    expect(
      within(summary).getByRole("link", { name: "Choose a service." })
    ).toHaveAttribute("href", "#book-service");
    expect(
      within(summary).getByRole("link", { name: "Enter your name." })
    ).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(submitBooking).not.toHaveBeenCalled();
  });

  it("has an unchecked marketing box and a honeypot people cannot reach", async () => {
    const user = userEvent.setup();
    const { container } = renderFlow();
    expect(screen.getByRole("checkbox")).not.toBeChecked();

    const honeypot = container.querySelector<HTMLInputElement>(
      'input[name="website"]'
    );
    expect(honeypot).not.toBeNull();
    expect(honeypot?.value).toBe("");
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(honeypot).toHaveAttribute("autocomplete", "off");
    expect(honeypot?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(
      screen.queryByRole("textbox", { name: HONEYPOT_LABEL })
    ).not.toBeInTheDocument();

    vi.mocked(submitBooking).mockResolvedValue({
      ok: true,
      data: { booking, manageToken: "tok" },
    });
    await chooseSlot(user);
    await fillDetails(user);
    await user.click(
      screen.getByRole("button", { name: "Request my booking" })
    );
    await waitFor(() => expect(submitBooking).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitBooking).mock.calls[0]?.[0]).toMatchObject({
      website: "",
      marketingConsent: false,
      startsAt: TUE,
      serviceId: SERVICE_ID,
    });
  });

  it("reuses the idempotency key when the same request is retried", async () => {
    const user = userEvent.setup();
    const uuids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];
    const spy = vi.spyOn(crypto, "randomUUID");
    spy.mockImplementation(
      () => uuids.shift() as `${string}-${string}-${string}-${string}-${string}`
    );
    vi.mocked(submitBooking)
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({
        ok: false,
        code: "unavailable",
        message: "Booking is unavailable right now.",
      })
      .mockResolvedValue({ ok: true, data: { booking, manageToken: "tok" } });
    renderFlow();
    await chooseSlot(user);
    await fillDetails(user);

    const send = () =>
      user.click(screen.getByRole("button", { name: "Request my booking" }));
    await send();
    expect(await screen.findByText(NOTHING_LOST)).toBeVisible();
    await send();
    expect(
      await screen.findByText("Booking is unavailable right now.")
    ).toBeVisible();

    const keys = vi
      .mocked(submitBooking)
      .mock.calls.map(([input]) => input.idempotencyKey);
    expect(keys).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "11111111-1111-4111-8111-111111111111",
    ]);

    // Changing the request starts a new submission with a new key.
    await user.type(
      screen.getByLabelText("Phone (optional)"),
      "+1 473 555 0100"
    );
    await send();
    const third = vi.mocked(submitBooking).mock.calls[2]?.[0].idempotencyKey;
    expect(third).toBe("22222222-2222-4222-8222-222222222222");
    spy.mockRestore();
  });

  it("records each funnel step with ids only, never the visitor's details", async () => {
    const user = userEvent.setup();
    const track = vi.fn();
    vi.mocked(submitBooking).mockResolvedValue({
      ok: true,
      data: { booking, manageToken: "tok" },
    });
    render(
      <BookingFlow
        actions={actions}
        managePath="/booking"
        storefront={storefront}
        studioName={STUDIO}
        track={track}
        turnstileSiteKey=""
      />
    );
    await chooseSlot(user);
    await fillDetails(user);
    await user.click(
      screen.getByRole("button", { name: "Request my booking" })
    );
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith("booking_confirmed", expect.anything())
    );

    expect(track.mock.calls.map(([event]) => event)).toEqual([
      "service_selected",
      "slot_selected",
      "booking_submitted",
      "booking_confirmed",
    ]);
    for (const [, properties] of track.mock.calls) {
      expect(Object.keys(properties)).toEqual(["service_id"]);
    }
    const sent = JSON.stringify(track.mock.calls);
    expect(sent).not.toContain("Ada");
    expect(sent).not.toContain("@");
  });

  it("explains a taken slot, clears the choice and reloads the times", async () => {
    const user = userEvent.setup();
    vi.mocked(submitBooking).mockResolvedValue({
      ok: false,
      code: "slot_taken",
      message: SLOT_TAKEN,
    });
    renderFlow();
    await chooseSlot(user);
    await fillDetails(user);
    expect(screen.getByText(CHOSEN_HYBRID)).toBeVisible();
    const before = vi.mocked(loadSlots).mock.calls.length;
    await user.click(
      screen.getByRole("button", { name: "Request my booking" })
    );

    expect(await screen.findByText(SLOT_TAKEN)).toBeVisible();
    await waitFor(() =>
      expect(vi.mocked(loadSlots).mock.calls.length).toBeGreaterThan(before)
    );
    expect(screen.getByRole("radio", { name: "9:30 am" })).not.toBeChecked();
  });

  it("shows the manage link from the booking receipt", async () => {
    const user = userEvent.setup();
    vi.mocked(submitBooking).mockResolvedValue({
      ok: true,
      data: { booking, manageToken: "secret-token-value-123" },
    });
    renderFlow();
    await chooseSlot(user);
    await fillDetails(user);
    await user.click(
      screen.getByRole("button", { name: "Request my booking" })
    );

    expect(
      await screen.findByRole("heading", { name: "Thank you, Ada" })
    ).toHaveFocus();
    expect(screen.getByText(WILL_CONFIRM)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Manage my booking" })
    ).toHaveAttribute("href", "/booking/secret-token-value-123");
  });

  it("asks for the emailed code first when the full price is due at booking", async () => {
    const user = userEvent.setup();
    vi.mocked(actions.requestEmailCode).mockResolvedValue({
      ok: true,
      data: { required: true, expiresInSeconds: 600 },
    });
    const fullPrice: BookingStorefront = {
      ...storefront,
      services: storefront.services.map((service) => ({
        ...service,
        due_at_booking_minor: service.price_minor,
      })),
    };
    renderFlow("", fullPrice);
    await chooseSlot(user);
    await fillDetails(user);
    await user.click(
      screen.getByRole("button", { name: "Email me a verification code" })
    );
    await waitFor(() => expect(actions.requestEmailCode).toHaveBeenCalled());
    expect(submitBooking).not.toHaveBeenCalled();
  });

  it("tells the customer before submitting that they pay the full price now", async () => {
    const user = userEvent.setup();
    const fullPrice: BookingStorefront = {
      ...storefront,
      services: storefront.services.map((service) => ({
        ...service,
        due_at_booking_minor: service.price_minor,
      })),
    };
    renderFlow("", fullPrice);
    expect(screen.queryByText(ANY_PAY_NOW)).not.toBeInTheDocument();
    await chooseSlot(user);
    expect(screen.getByText(PAY_FULL)).toBeVisible();
  });

  it("tells the customer before submitting that they pay a deposit now", async () => {
    const user = userEvent.setup();
    const deposit: BookingStorefront = {
      ...storefront,
      services: storefront.services.map((service) => ({
        ...service,
        due_at_booking_minor: 1000,
      })),
    };
    renderFlow("", deposit);
    await chooseSlot(user);
    expect(screen.getByText(PAY_DEPOSIT)).toBeVisible();
  });

  it("offers Pay now on the confirmation while the payment is due", async () => {
    const user = userEvent.setup();
    vi.mocked(submitBooking).mockResolvedValue({
      ok: true,
      data: {
        manageToken: "secret-token-value-123",
        booking: {
          ...booking,
          status: "pending_payment",
          deposit_minor: 22_500,
          payment: {
            status: "due",
            amount_minor: 22_500,
            paid_minor: 0,
            refunded_minor: 0,
            balance_at_salon_minor: 0,
            currency: "XCD",
            checkout_url: "https://checkout.stripe.com/c/pay/cs_test_1",
          },
        },
      },
    });
    renderFlow();
    await chooseSlot(user);
    await fillDetails(user);
    await user.click(
      screen.getByRole("button", { name: "Request my booking" })
    );
    expect(await screen.findByText(HELD_WHILE_PAYING)).toBeVisible();
    expect(screen.getByRole("link", { name: "Pay now" })).toHaveAttribute(
      "href",
      "https://checkout.stripe.com/c/pay/cs_test_1"
    );
    expect(
      screen.getByRole("link", { name: "Manage my booking" })
    ).toHaveAttribute("href", "/booking/secret-token-value-123");
  });

  it("invites a guest to create an account after booking, without changing the booking", async () => {
    const user = userEvent.setup();
    vi.mocked(submitBooking).mockResolvedValue({
      ok: true,
      data: { booking, manageToken: "tok-1" },
    });
    renderFlow("", storefront, { href: "https://auth.example.test/signup" });
    expect(screen.queryByText(KEEP_BOOKINGS)).not.toBeInTheDocument();
    await chooseSlot(user);
    await fillDetails(user);
    await user.click(
      screen.getByRole("button", { name: "Request my booking" })
    );

    await screen.findByRole("heading", { name: "Thank you, Ada" });
    expect(
      screen.getByRole("heading", { name: "Keep your bookings in one place" })
    ).toBeVisible();
    expect(screen.getByText(MY_BOOKINGS)).toBeVisible();
    expect(screen.getByText(NEVER_NEEDS)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Create an account or sign in" })
    ).toHaveAttribute("href", "https://auth.example.test/signup");
    // The manage link is still there and still first.
    expect(
      screen.getByRole("link", { name: "Manage my booking" })
    ).toHaveAttribute("href", "/booking/tok-1");
  });

  it("shows no invitation when the host passes none (signed in)", async () => {
    const user = userEvent.setup();
    vi.mocked(submitBooking).mockResolvedValue({
      ok: true,
      data: { booking, manageToken: "tok-2" },
    });
    renderFlow();
    await chooseSlot(user);
    await fillDetails(user);
    await user.click(
      screen.getByRole("button", { name: "Request my booking" })
    );

    await screen.findByRole("heading", { name: "Thank you, Ada" });
    expect(
      screen.queryByRole("link", { name: "Create an account or sign in" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(MY_BOOKINGS)).not.toBeInTheDocument();
  });

  it("renders the manage link through the host's link component", async () => {
    const user = userEvent.setup();
    vi.mocked(submitBooking).mockResolvedValue({
      ok: true,
      data: { booking, manageToken: "tok-42" },
    });
    const HostLink = ({
      children,
      className,
      href,
    }: {
      children: ReactNode;
      className?: string;
      href: string;
    }) => (
      <a className={className} data-host="yes" href={href}>
        {children}
      </a>
    );
    render(
      <BookingFlow
        actions={actions}
        ManageLink={HostLink}
        managePath="/manage"
        storefront={storefront}
        studioName={STUDIO}
        turnstileSiteKey=""
      />
    );
    await chooseSlot(user);
    await fillDetails(user);
    await user.click(
      screen.getByRole("button", { name: "Request my booking" })
    );

    expect(
      await screen.findByRole("link", { name: "Manage my booking" })
    ).toHaveAttribute("data-host", "yes");
    expect(
      screen.getByRole("link", { name: "Manage my booking" })
    ).toHaveAttribute("href", "/manage/tok-42");
  });

  it("loads no Turnstile script without a site key", () => {
    renderFlow("");
    expect(
      document.querySelector('script[src*="challenges.cloudflare.com"]')
    ).toBeNull();
  });
});

describe("BookingFlow wording and announcements", () => {
  it("names the place of the timezone, not its technical name", () => {
    renderFlow();
    expect(screen.getByText("Times are in Grenada time.")).toBeVisible();
  });

  it("writes a one-hour cutoff in the singular", () => {
    renderFlow("", { ...storefront, cancel_cutoff_hours: 1 });
    expect(screen.getByText(ONE_HOUR_CUTOFF)).toBeVisible();
  });

  it("says to contact the business directly when no service is open and no contact is set", () => {
    renderFlow("", { ...storefront, services: [] });
    expect(screen.getByText(CONTACT_DIRECTLY)).toBeVisible();
    expect(screen.queryByRole("list", { name: CONTACT_LIST })).toBeNull();
  });

  it("links the business's contacts when no service is open", () => {
    renderFlow("", {
      ...storefront,
      services: [],
      contact: { ...NO_CONTACT, phone: "+14734401234" },
    });
    expect(screen.getByText(CONTACT_COLON)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Call +14734401234" })
    ).toHaveAttribute("href", "tel:+14734401234");
  });

  it("adds the contact links under a failure that sends people to the business", async () => {
    const user = userEvent.setup();
    submitBooking.mockResolvedValue({
      ok: false,
      code: "unavailable",
      message:
        "Booking is unavailable right now. Please try again shortly, or contact the business.",
    });
    renderFlow("", {
      ...storefront,
      contact: { ...NO_CONTACT, instagram: "teststudio" },
    });
    await chooseSlot(user);
    await fillDetails(user);
    await user.click(
      screen.getByRole("button", { name: "Request my booking" })
    );
    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByRole("link", { name: INSTAGRAM_LINK })
    ).toHaveAttribute("href", "https://instagram.com/teststudio");
  });

  it("ties the service and time errors to their groups", async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(
      screen.getByRole("button", { name: "Request my booking" })
    );

    const service = screen.getByRole("group", { name: "1. Choose a service" });
    const time = screen.getByRole("group", { name: "2. Pick a day and time" });
    await waitFor(() => expect(service).toHaveAccessibleDescription());
    expect(time).toHaveAccessibleDescription();
  });

  it("announces the date range when the window moves", async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole("radio", { name: HYBRID }));
    await screen.findByRole("radio", { name: "9:30 am" });

    expect(screen.getByText(DATE_RANGE)).toHaveAttribute("aria-live", "polite");
  });

  it("turns spell-check off for the email address", async () => {
    const user = userEvent.setup();
    renderFlow();
    await chooseSlot(user);
    expect(await screen.findByLabelText("Email")).toHaveAttribute(
      "spellcheck",
      "false"
    );
    expect(screen.getByLabelText("Name")).not.toHaveAttribute(
      "spellcheck",
      "false"
    );
  });
});

const ADA = {
  email: "ada@example.com",
  name: "Ada Lovelace",
  phone: "+1 473 555 0100",
  signOutAction: "/auth/logout",
};
const SECOND_SERVICE = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c11";
const JERIANN = "a1b2c3d4-0000-4000-8000-000000000001";
const MAYA = "a1b2c3d4-0000-4000-8000-000000000002";
const LAST_TIME = /last time with Jeriann/u;
const BOOKING_AS = /Booking as/u;
const LASH_LIFT = /Lash lift/u;

const twoServices: BookingStorefront = {
  ...storefront,
  providers: [
    { id: JERIANN, name: "Jeriann", service_ids: [SERVICE_ID] },
    { id: MAYA, name: "Maya", service_ids: [SERVICE_ID, SECOND_SERVICE] },
  ],
  brand_color: null,
  logo_url: null,
  services: [
    ...storefront.services,
    {
      id: SECOND_SERVICE,
      name: "Lash lift",
      category: "Lashes",
      description: null,
      duration_min: 60,
      price_minor: 9000,
      deposit_minor: 0,
    },
  ],
};

function renderSignedIn(props: Partial<ComponentProps<typeof BookingFlow>>) {
  return render(
    <BookingFlow
      actions={actions}
      managePath="/booking"
      storefront={twoServices}
      studioName={STUDIO}
      turnstileSiteKey=""
      {...props}
    />
  );
}

describe("signed-in visitor", () => {
  it("starts with their own name, email and phone, and says who they are booking as", () => {
    renderSignedIn({ signedIn: ADA });
    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
    expect(screen.getByLabelText("Phone (optional)")).toHaveValue(
      "+1 473 555 0100"
    );
    expect(screen.getByText(BOOKING_AS)).toHaveTextContent(
      "Booking as Ada Lovelace. Not you?"
    );
    const signOut = screen.getByRole("button", { name: "Sign out" });
    expect(signOut.closest("form")).toHaveAttribute("action", "/auth/logout");
    expect(signOut.closest("form")).toHaveAttribute("method", "post");
    // The sign-out form is not inside the booking form (forms cannot nest).
    expect(
      screen.getByRole("form", { name: "Book an appointment" })
    ).not.toContainElement(signOut);
  });

  it("still lets them change every prefilled field", async () => {
    const user = userEvent.setup();
    renderSignedIn({ signedIn: ADA });
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Grace Hopper");
    const email = screen.getByLabelText("Email");
    await user.clear(email);
    await user.type(email, "grace@example.com");
    const phone = screen.getByLabelText("Phone (optional)");
    await user.clear(phone);
    expect(name).toHaveValue("Grace Hopper");
    expect(email).toHaveValue("grace@example.com");
    expect(phone).toHaveValue("");
  });

  it("shows the email as who they are booking as when the account has no name", () => {
    renderSignedIn({ signedIn: { ...ADA, name: "" } });
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByText(BOOKING_AS)).toHaveTextContent(
      "Booking as ada@example.com."
    );
  });

  it("books with the prefilled details as they are", async () => {
    const user = userEvent.setup();
    vi.mocked(submitBooking).mockResolvedValue({
      ok: true,
      data: { booking, manageToken: "tok-9" },
    });
    renderSignedIn({ signedIn: ADA });
    await chooseSlot(user);
    await user.click(
      screen.getByRole("button", { name: "Request my booking" })
    );
    await screen.findByRole("heading", { name: "Thank you, Ada" });
    expect(submitBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ada@example.com",
        name: "Ada Lovelace",
        phone: "+1 473 555 0100",
      })
    );
  });
});

describe("guest", () => {
  it("gets a blank form, no 'Booking as' line and no shortcuts", () => {
    renderSignedIn({});
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.getByLabelText("Phone (optional)")).toHaveValue("");
    expect(screen.queryByText(BOOKING_AS)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Book again" })
    ).not.toBeInTheDocument();
  });
});

describe("Book again", () => {
  it("offers shortcuts above the full service list, which stays", () => {
    renderSignedIn({
      bookAgain: [{ providerId: JERIANN, serviceId: SECOND_SERVICE }],
      signedIn: ADA,
    });
    const heading = screen.getByRole("heading", { name: "Book again" });
    const list = screen.getByRole("list", { name: "Book again" });
    expect(list).toHaveTextContent("Lash lift");
    expect(list).toHaveTextContent("1 hr");
    expect(list).toHaveTextContent("EC$90");
    const firstRadio = screen.getByRole("radio", { name: HYBRID });
    // Shortcuts come before the radios; every service is still offered.
    expect(heading.compareDocumentPosition(firstRadio)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("chooses the service and loads its times when pressed", async () => {
    const user = userEvent.setup();
    renderSignedIn({
      bookAgain: [{ providerId: JERIANN, serviceId: SECOND_SERVICE }],
      signedIn: ADA,
    });
    const shortcut = screen.getByRole("button", { name: LASH_LIFT });
    expect(shortcut).toHaveAttribute("aria-pressed", "false");
    await user.click(shortcut);
    expect(shortcut).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("radio", { name: LASH_LIFT })).toBeChecked();
    await waitFor(() =>
      expect(loadSlots).toHaveBeenCalledWith(SECOND_SERVICE, expect.any(String))
    );
  });

  it("names the provider used last time when the business has more than one", () => {
    renderSignedIn({
      bookAgain: [{ providerId: JERIANN, serviceId: SERVICE_ID }],
      signedIn: ADA,
    });
    expect(screen.getByRole("list", { name: "Book again" })).toHaveTextContent(
      LAST_TIME
    );
  });

  it("skips a service the business no longer offers, and a provider who no longer does it", () => {
    renderSignedIn({
      bookAgain: [
        {
          providerId: JERIANN,
          serviceId: "11111111-1111-4111-8111-111111111111",
        },
        // Jeriann does not offer the lash lift: the service shows, her name does not.
        { providerId: JERIANN, serviceId: SECOND_SERVICE },
      ],
      signedIn: ADA,
    });
    const list = screen.getByRole("list", { name: "Book again" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(list).toHaveTextContent("Lash lift");
    expect(list).not.toHaveTextContent("last time with");
  });

  it("shows nothing for a person with no history", () => {
    renderSignedIn({ bookAgain: [], signedIn: ADA });
    expect(
      screen.queryByRole("heading", { name: "Book again" })
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });
});

describe("BookingFlow error messages follow the person's changes", () => {
  const SUBMIT = "Request my booking";
  const NAME_ERROR = "Enter your name.";
  const TIME_ERROR = "Choose a day and time.";

  it("drops a field's error once the field is valid", async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole("button", { name: SUBMIT }));
    expect(await screen.findByLabelText("Name")).toHaveAttribute(
      "aria-invalid",
      "true"
    );

    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");

    expect(screen.getByLabelText("Name")).toHaveAttribute(
      "aria-invalid",
      "false"
    );
    expect(screen.queryByText(NAME_ERROR)).not.toBeInTheDocument();
  });

  it("clears the day and time error once a time is picked", async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole("button", { name: SUBMIT }));
    expect((await screen.findAllByText(TIME_ERROR)).length).toBeGreaterThan(0);

    await chooseSlot(user);

    expect(screen.queryByText(TIME_ERROR)).not.toBeInTheDocument();
  });

  it("keeps the message while the value is still wrong", async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.type(screen.getByLabelText("Email"), "ada@");
    await user.click(screen.getByRole("button", { name: SUBMIT }));
    expect((await screen.findAllByText(EMAIL_ERROR)).length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText("Email"), "x");

    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(screen.getAllByText(EMAIL_ERROR).length).toBeGreaterThan(0);
  });
});

describe("BookingFlow confirm step wording", () => {
  it("says there is no payment online when the service takes no deposit", async () => {
    const user = userEvent.setup();
    renderFlow();
    expect(screen.queryByText(NO_PAYMENT)).not.toBeInTheDocument();
    await chooseSlot(user);
    expect(screen.getByText(NO_PAYMENT)).toBeVisible();
    expect(screen.getByText(CANCEL_RULE)).toBeVisible();
  });

  it("does not say there is no payment online when a deposit is due", async () => {
    const user = userEvent.setup();
    renderFlow("", {
      ...storefront,
      services: storefront.services.map((service) => ({
        ...service,
        due_at_booking_minor: 1000,
      })),
    });
    await chooseSlot(user);
    expect(screen.queryByText(NO_PAYMENT)).not.toBeInTheDocument();
    expect(screen.getByText(PAY_DEPOSIT)).toBeVisible();
  });

  it("shows the selected service's note when it has one", async () => {
    const user = userEvent.setup();
    renderFlow("", {
      ...storefront,
      services: storefront.services.map((service) => ({
        ...service,
        description: "Consultation required",
      })),
    });
    await chooseSlot(user);
    expect(screen.getByText(CONSULTATION)).toBeVisible();
  });

  it("shows no service note when the service has none", async () => {
    const user = userEvent.setup();
    renderFlow();
    await chooseSlot(user);
    expect(screen.queryByText(NOTE_PREFIX)).not.toBeInTheDocument();
  });
});

describe("BookingFlow rules line and full policy", () => {
  const RULES_LINE = (text: string) => screen.getByText(text);

  it("says only the change rule until a service is chosen", () => {
    renderFlow();
    expect(
      RULES_LINE(
        "Change or cancel online up to 24 hours before; after that, contact Test Studio."
      )
    ).toBeVisible();
  });

  it("states a non-refundable deposit beside the Book button", async () => {
    const user = userEvent.setup();
    renderFlow("", {
      ...storefront,
      deposit_non_refundable: true,
      services: storefront.services.map((service) => ({
        ...service,
        deposit_minor: 4000,
        due_at_booking_minor: 4000,
      })),
    });
    await chooseSlot(user);
    expect(
      RULES_LINE(
        "EC$40 deposit, not refundable once your booking is confirmed. Change or cancel online up to 24 hours before; after that, contact Test Studio."
      )
    ).toBeVisible();
  });

  it("says a refundable deposit is refundable", async () => {
    const user = userEvent.setup();
    renderFlow("", {
      ...storefront,
      services: storefront.services.map((service) => ({
        ...service,
        due_at_booking_minor: 3600,
      })),
    });
    await chooseSlot(user);
    expect(
      RULES_LINE(
        "EC$36 deposit, refunded if you cancel at least 24 hours before it starts. Change or cancel online up to 24 hours before; after that, contact Test Studio."
      )
    ).toBeVisible();
  });

  it("says a deposit with no payment route is paid at the salon", async () => {
    const user = userEvent.setup();
    renderFlow("", {
      ...storefront,
      services: storefront.services.map((service) => ({
        ...service,
        deposit_minor: 3000,
        due_at_booking_minor: 0,
      })),
    });
    await chooseSlot(user);
    expect(
      RULES_LINE(
        "EC$30 deposit, paid at the salon. Change or cancel online up to 24 hours before; after that, contact Test Studio."
      )
    ).toBeVisible();
  });

  it("opens the full policy on tap and hides it when there is none", async () => {
    const user = userEvent.setup();
    const { unmount } = renderFlow("", {
      ...storefront,
      booking_policy: "Late by 15 minutes and we may need to move you.",
    });
    const policy = "Late by 15 minutes and we may need to move you.";
    expect(screen.getByText(policy)).not.toBeVisible();
    await user.click(screen.getByText("Full policy"));
    expect(screen.getByText(policy)).toBeVisible();
    unmount();
    renderFlow("", { ...storefront, booking_policy: null });
    expect(screen.queryByText("Full policy")).toBeNull();
  });
});
