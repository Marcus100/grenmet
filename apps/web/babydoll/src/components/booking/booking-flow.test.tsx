import type { BookingStorefront } from "@barrelsgd/api-client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSlots, submitBooking } from "@/app/book/actions";
import { BookingFlow } from "./booking-flow";

vi.mock("@/app/book/actions", () => ({
  loadSlots: vi.fn(),
  submitBooking: vi.fn(),
}));

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const NO_TIMES = /No times are open/;
const NOTHING_LOST = /Nothing was lost/;
const CHOSEN_HYBRID = /Hybrid: .*9:30 am/;
const WILL_CONFIRM = /studio will confirm it by email/;
const HYBRID = /Hybrid/;
const A_TIME = /\d:\d\d [ap]m/;
const HONEYPOT_LABEL = /Leave this field empty/;
const SERVICE_ID = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10";
const TUE = "2027-01-05T13:30:00Z";
const SLOT_TAKEN = "That time has just been taken. Please choose another.";

const storefront: BookingStorefront = {
  slug: "babydoll-beauty-bar",
  display_name: "Babydoll Beauty Bar",
  timezone: "America/Grenada",
  currency: "XCD",
  cancel_cutoff_hours: 24,
  providers: [],
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
};

function renderFlow(siteKey = "") {
  return render(
    <BookingFlow storefront={storefront} turnstileSiteKey={siteKey} />
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

  it("loads no Turnstile script without a site key", () => {
    renderFlow("");
    expect(
      document.querySelector('script[src*="challenges.cloudflare.com"]')
    ).toBeNull();
  });
});
