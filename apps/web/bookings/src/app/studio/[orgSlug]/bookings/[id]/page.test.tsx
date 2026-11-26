import type { BookingStudioDetail } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKING_ID, ORG_ID, session } from "@/test/studio";

const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(() => Promise.resolve(session)),
}));
vi.mock("@/lib/studio-api", () => ({
  findOrganisation: vi.fn(),
  getBooking: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

vi.mock("@/components/studio/booking-actions", () => ({
  BookingActions: ({ status }: { status: string }) => (
    <button type="button">Actions for {status}</button>
  ),
}));

vi.mock("@/components/studio/record-deposit", () => ({
  RecordDeposit: ({
    amountLabel,
    due,
    takesDeposit,
  }: {
    amountLabel: string;
    due: boolean;
    takesDeposit: boolean;
  }) => (
    <button type="button">
      Record deposit {amountLabel} due={String(due)} takes=
      {String(takesDeposit)}
    </button>
  ),
}));

vi.mock("@/components/studio/deposit-received", () => ({
  DepositReceived: ({
    amountLabel,
    canMark,
  }: {
    amountLabel: string;
    canMark: boolean;
  }) => (
    <button type="button">
      Business deposit {amountLabel} can-mark={String(canMark)}
    </button>
  ),
}));

import { findOrganisation, getBooking } from "@/lib/studio-api";
import StudioBookingPage from "./page";

const RECORD = /Record deposit/u;
const BUSINESS_BUTTON = /Business deposit/u;
const CAN_MARK = /can-mark=true/u;
const CANNOT_MARK = /can-mark=false/u;

const props = (id = BOOKING_ID) => ({
  params: Promise.resolve({ id, orgSlug: "sea-salt" }),
});

function detail(
  overrides: Partial<BookingStudioDetail> = {}
): BookingStudioDetail {
  return {
    id: BOOKING_ID,
    status: "confirmed",
    source: "online",
    service_id: "44444444-4444-4444-8444-444444444444",
    service_name: "Deep tissue massage",
    provider_id: "33333333-3333-4333-8333-333333333333",
    provider_name: "Maya",
    customer: {
      id: "55555555-5555-4555-8555-555555555555",
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: null,
    },
    starts_at: "2026-10-21T14:00:00Z",
    ends_at: "2026-10-21T15:30:00Z",
    timezone: "America/Grenada",
    price_minor: 15_000,
    deposit_minor: 2500,
    payment_kind: "deposit",
    currency: "XCD",
    notes: "Allergic to lavender",
    cancel_reason: null,
    cancelled_at: null,
    created_at: "2026-10-18T12:00:00Z",
    deposit_intent_id: null,
    deposit_captured_minor: 0,
    deposit_refunded_minor: 0,
    balance_at_salon_minor: 0,
    events: [
      {
        from_status: null,
        to_status: "pending_payment",
        actor_user_id: null,
        note: null,
        created_at: "2026-10-18T12:00:00Z",
      },
      {
        from_status: "pending_payment",
        to_status: "confirmed",
        actor_user_id: null,
        note: "Deposit received",
        created_at: "2026-10-18T12:05:00Z",
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  reportError.mockReset();
  vi.mocked(getBooking).mockReset();
  vi.mocked(findOrganisation).mockResolvedValue({
    id: ORG_ID,
    name: "Sea Salt Spa",
    slug: "sea-salt",
    role: "member",
  });
});

describe("studio booking detail", () => {
  it("shows the customer, notes and timeline, and no action buttons", async () => {
    vi.mocked(getBooking).mockResolvedValue(detail());
    render(await StudioBookingPage(props()));
    expect(
      screen.getByRole("heading", { name: "Deep tissue massage" })
    ).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "ada@example.com" })
    ).toHaveAttribute("href", "mailto:ada@example.com");
    expect(screen.getByText("Phone").nextSibling).toHaveTextContent(
      "Not given"
    );
    expect(screen.getByText("Allergic to lavender")).toBeInTheDocument();
    expect(screen.getByText("Created as Awaiting deposit")).toBeInTheDocument();
    expect(
      screen.getByText("Awaiting deposit to Confirmed")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("titles a deposit event by what happened, not as a status change", async () => {
    vi.mocked(getBooking).mockResolvedValue(
      detail({
        events: [
          {
            from_status: "confirmed",
            to_status: "confirmed",
            actor_user_id: null,
            note: "Deposit received by cash",
            created_at: "2026-10-18T12:05:00Z",
          },
          {
            from_status: "confirmed",
            to_status: "confirmed",
            actor_user_id: null,
            note: "Deposit receipt undone",
            created_at: "2026-10-18T12:06:00Z",
          },
        ],
      })
    );
    render(await StudioBookingPage(props()));
    expect(screen.getByText("Deposit received")).toBeInTheDocument();
    expect(screen.getByText("By cash")).toBeInTheDocument();
    expect(screen.getByText("Deposit marked not received")).toBeInTheDocument();
    expect(screen.queryByText("Confirmed to Confirmed")).toBeNull();
  });

  it("titles a reschedule Time changed and never shows a raw ISO time", async () => {
    const moved = {
      from_status: "confirmed" as const,
      to_status: "confirmed" as const,
      actor_user_id: null,
      note: "Rescheduled from 2026-10-20T14:00Z by the business",
      created_at: "2026-10-18T12:05:00Z",
    };
    // Two entries with the same time and status: the list keys must not collide.
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(getBooking).mockResolvedValue(detail({ events: [moved, moved] }));
    const { container } = render(await StudioBookingPage(props()));
    expect(screen.getAllByText("Time changed")).toHaveLength(2);
    expect(container.textContent).not.toContain("2026-10-20T14:00Z");
    expect(container.textContent).not.toContain("Confirmed to Confirmed");
    expect(
      errors.mock.calls.some((call) => String(call[0]).includes("same key"))
    ).toBe(false);
    errors.mockRestore();
  });

  it("shows the action buttons to an admin and an owner, not a member", async () => {
    vi.mocked(getBooking).mockResolvedValue(detail());
    for (const [role, shown] of [
      ["admin", true],
      ["owner", true],
      ["member", false],
    ] as const) {
      vi.mocked(findOrganisation).mockResolvedValue({
        id: ORG_ID,
        name: "Sea Salt Spa",
        slug: "sea-salt",
        role,
      });
      const { unmount } = render(await StudioBookingPage(props()));
      expect(
        screen.queryByRole("button", { name: "Actions for confirmed" }) !== null
      ).toBe(shown);
      unmount();
    }
  });

  it.each([
    [
      "due",
      { deposit_captured_minor: 0, deposit_refunded_minor: 0 },
      "Deposit due",
    ],
    [
      "paid",
      { deposit_captured_minor: 2500, deposit_refunded_minor: 0 },
      "Deposit paid",
    ],
    [
      "refunded",
      { deposit_captured_minor: 2500, deposit_refunded_minor: 2500 },
      "Deposit refunded",
    ],
    ["none", { deposit_minor: 0 }, "No deposit"],
  ])("shows the %s deposit badge", async (_name, fields, label) => {
    vi.mocked(getBooking).mockResolvedValue(detail(fields));
    render(await StudioBookingPage(props()));
    expect(
      screen.getByText(label, { selector: "[data-slot=badge]" })
    ).toBeInTheDocument();
  });

  it("says Payment instead of Deposit when the booking asked for the full price", async () => {
    vi.mocked(getBooking).mockResolvedValue(
      detail({
        payment_kind: "payment",
        deposit_captured_minor: 2500,
        deposit_refunded_minor: 2500,
      })
    );
    render(await StudioBookingPage(props()));
    expect(
      screen.getByText("Payment refunded", { selector: "[data-slot=badge]" })
    ).toBeInTheDocument();
    expect(screen.getByText("Payment asked")).toBeInTheDocument();
    expect(screen.getByText("Payment received")).toBeInTheDocument();
    expect(screen.queryByText("Deposit asked")).not.toBeInTheDocument();
    expect(screen.queryByText("Deposit refunded")).not.toBeInTheDocument();
  });

  it("is a 404 for an unknown booking", async () => {
    vi.mocked(getBooking).mockResolvedValue(null);
    await expect(StudioBookingPage(props())).rejects.toHaveProperty(
      "message",
      "NEXT_NOT_FOUND"
    );
  });

  it("is a 404 for an id that is not a UUID, without calling the API", async () => {
    await expect(StudioBookingPage(props("nope"))).rejects.toHaveProperty(
      "message",
      "NEXT_NOT_FOUND"
    );
    expect(getBooking).not.toHaveBeenCalled();
  });

  describe("record deposit", () => {
    const asRole = (role: "owner" | "admin" | "member") =>
      vi.mocked(findOrganisation).mockResolvedValue({
        id: ORG_ID,
        name: "Sea Salt Spa",
        slug: "sea-salt",
        role,
      });

    it("is offered to an admin and an owner with the booking's own amount", async () => {
      vi.mocked(getBooking).mockResolvedValue(detail());
      for (const role of ["admin", "owner"] as const) {
        asRole(role);
        const { unmount } = render(await StudioBookingPage(props()));
        expect(screen.getByRole("button", { name: RECORD })).toHaveTextContent(
          "due=true"
        );
        unmount();
      }
    });

    it("is not offered to a member", async () => {
      asRole("member");
      vi.mocked(getBooking).mockResolvedValue(detail());
      render(await StudioBookingPage(props()));
      expect(screen.queryByRole("button", { name: RECORD })).toBeNull();
    });

    it.each(["cancelled", "completed", "no_show"] as const)(
      "is not offered for a %s booking",
      async (status) => {
        asRole("admin");
        vi.mocked(getBooking).mockResolvedValue(detail({ status }));
        render(await StudioBookingPage(props()));
        expect(screen.getByRole("button", { name: RECORD })).toHaveTextContent(
          "takes=false"
        );
      }
    );

    it("is not offered when there is no deposit", async () => {
      asRole("admin");
      vi.mocked(getBooking).mockResolvedValue(detail({ deposit_minor: 0 }));
      render(await StudioBookingPage(props()));
      expect(screen.getByRole("button", { name: RECORD })).toHaveTextContent(
        "takes=false"
      );
    });

    it("is told the deposit is not due once it is paid", async () => {
      asRole("admin");
      vi.mocked(getBooking).mockResolvedValue(
        detail({ deposit_captured_minor: 2500 })
      );
      render(await StudioBookingPage(props()));
      expect(screen.getByRole("button", { name: RECORD })).toHaveTextContent(
        "due=false"
      );
    });
  });

  describe("Call and WhatsApp", () => {
    const withPhone = (phone: string | null) =>
      detail({
        customer: { ...detail().customer, phone },
      });

    it("offers Call and WhatsApp for a Grenada local number", async () => {
      vi.mocked(getBooking).mockResolvedValue(withPhone("444 1234"));
      render(await StudioBookingPage(props()));
      expect(screen.getByRole("link", { name: "Call" })).toHaveAttribute(
        "href",
        "tel:4441234"
      );
      const chat = screen.getByRole("link", { name: "WhatsApp" });
      expect(chat).toHaveAttribute("href", "https://wa.me/14734441234");
      expect(chat).toHaveAttribute("target", "_blank");
      expect(chat.getAttribute("rel")).toContain("noopener");
    });

    it("keeps the number out of any query string", async () => {
      vi.mocked(getBooking).mockResolvedValue(withPhone("+1 473 444 1234"));
      render(await StudioBookingPage(props()));
      const links = [
        screen.getByRole("link", { name: "Call" }),
        screen.getByRole("link", { name: "WhatsApp" }),
      ];
      for (const link of links) {
        expect(link.getAttribute("href")).not.toContain("?");
      }
    });

    it("offers only Call when the number cannot be made international", async () => {
      vi.mocked(getBooking).mockResolvedValue(withPhone("4441234567"));
      render(await StudioBookingPage(props()));
      expect(screen.getByRole("link", { name: "Call" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "WhatsApp" })).toBeNull();
    });

    it("offers neither without a phone number", async () => {
      vi.mocked(getBooking).mockResolvedValue(withPhone(null));
      render(await StudioBookingPage(props()));
      expect(screen.queryByRole("link", { name: "Call" })).toBeNull();
      expect(screen.queryByRole("link", { name: "WhatsApp" })).toBeNull();
    });
  });
});

const NOTICE = /They've booked with you before/u;

describe("returning client notice", () => {
  it("shows to staff on a pending request from a returning client", async () => {
    vi.mocked(getBooking).mockResolvedValue(
      detail({ status: "pending", returning_client: true })
    );
    vi.mocked(findOrganisation).mockResolvedValue({
      id: ORG_ID,
      name: "Sea Salt Spa",
      slug: "sea-salt",
      role: "owner",
    });
    render(await StudioBookingPage(props()));
    expect(screen.getByText(NOTICE)).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Returning client" })
    ).toBeVisible();
  });

  it("is not shown to a member", async () => {
    vi.mocked(getBooking).mockResolvedValue(
      detail({ status: "pending", returning_client: true })
    );
    render(await StudioBookingPage(props()));
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("is not shown once the request is confirmed", async () => {
    vi.mocked(getBooking).mockResolvedValue(
      detail({ status: "confirmed", returning_client: true })
    );
    vi.mocked(findOrganisation).mockResolvedValue({
      id: ORG_ID,
      name: "Sea Salt Spa",
      slug: "sea-salt",
      role: "owner",
    });
    render(await StudioBookingPage(props()));
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});

const PAYMENT_DUE = /Payment due/u;
const DEPOSIT_DUE = /Deposit due/u;

describe("cancelled booking with a captured deposit", () => {
  it("shows the deposit as paid, not as cancelled", async () => {
    vi.mocked(getBooking).mockResolvedValue(
      detail({
        status: "cancelled",
        deposit_minor: 2500,
        deposit_captured_minor: 2500,
      })
    );
    vi.mocked(findOrganisation).mockResolvedValue({
      id: ORG_ID,
      name: "Sea Salt Spa",
      slug: "sea-salt",
      role: "owner",
    });
    render(await StudioBookingPage(props()));
    expect(screen.getByText("Deposit paid")).toBeVisible();
    expect(screen.queryByText("Payment cancelled")).toBeNull();
    expect(screen.queryByText("Deposit cancelled")).toBeNull();
  });
});

describe("cancelled booking with an unpaid payment (#1849)", () => {
  it("says Deposit cancelled for a deposit booking", async () => {
    vi.mocked(getBooking).mockResolvedValue(
      detail({
        status: "cancelled",
        deposit_minor: 2500,
        deposit_captured_minor: 0,
      })
    );
    vi.mocked(findOrganisation).mockResolvedValue({
      id: ORG_ID,
      name: "Sea Salt Spa",
      slug: "sea-salt",
      role: "owner",
    });
    render(await StudioBookingPage(props()));
    expect(screen.getByText("Deposit cancelled")).toBeVisible();
  });

  it("shows Payment cancelled and no due badge or record prompt", async () => {
    vi.mocked(getBooking).mockResolvedValue(
      detail({
        status: "cancelled",
        payment_kind: "payment",
        deposit_minor: 2500,
        deposit_captured_minor: 0,
      })
    );
    vi.mocked(findOrganisation).mockResolvedValue({
      id: ORG_ID,
      name: "Sea Salt Spa",
      slug: "sea-salt",
      role: "owner",
    });
    render(await StudioBookingPage(props()));
    expect(screen.getByText("Payment cancelled")).toBeVisible();
    expect(screen.queryByText(PAYMENT_DUE)).toBeNull();
    expect(screen.queryByText(DEPOSIT_DUE)).toBeNull();
    expect(screen.getByRole("button", { name: RECORD })).toHaveTextContent(
      "due=false"
    );
  });
});

describe("deposit paid to the business (#1869)", () => {
  const TO_BUSINESS = { deposit_minor: 0, deposit_to_business_minor: 5300 };

  function asRole(role: "admin" | "member") {
    vi.mocked(findOrganisation).mockResolvedValue({
      id: ORG_ID,
      name: "Sea Salt Spa",
      slug: "sea-salt",
      role,
    });
  }

  it("offers marking it received to an admin on an open booking, not Record deposit", async () => {
    asRole("admin");
    vi.mocked(getBooking).mockResolvedValue(
      detail({ ...TO_BUSINESS, status: "pending" })
    );
    render(await StudioBookingPage(props()));
    expect(screen.getByRole("button", { name: CAN_MARK })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: RECORD })).toBeNull();
    expect(screen.getByText("Deposit due")).toBeInTheDocument();
  });

  it("shows the amount to the business in the price card, not Deposit asked None", async () => {
    asRole("admin");
    vi.mocked(getBooking).mockResolvedValue(
      detail({ ...TO_BUSINESS, status: "confirmed" })
    );
    render(await StudioBookingPage(props()));
    expect(screen.getByText("To the business").nextSibling).toHaveTextContent(
      "EC$53"
    );
    expect(screen.queryByText("Deposit asked")).toBeNull();
  });

  it("shows received once marked, and no mark action for it", async () => {
    asRole("admin");
    vi.mocked(getBooking).mockResolvedValue(
      detail({
        ...TO_BUSINESS,
        deposit_received_at: "2026-10-20T12:00:00Z",
        deposit_received_method: "cash",
        status: "confirmed",
      })
    );
    render(await StudioBookingPage(props()));
    // The badge; the timeline's own note also reads "Deposit received".
    expect(
      screen.getByText("Deposit received", { selector: "span" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: CANNOT_MARK })
    ).toBeInTheDocument();
  });

  it("says Deposit cancelled and never due on a cancelled booking", async () => {
    asRole("admin");
    vi.mocked(getBooking).mockResolvedValue(
      detail({ ...TO_BUSINESS, status: "cancelled" })
    );
    render(await StudioBookingPage(props()));
    expect(screen.getByText("Deposit cancelled")).toBeInTheDocument();
    expect(screen.queryByText("Deposit due")).toBeNull();
    expect(
      screen.getByRole("button", { name: CANNOT_MARK })
    ).toBeInTheDocument();
  });

  it("is not offered to a member", async () => {
    vi.mocked(getBooking).mockResolvedValue(
      detail({ ...TO_BUSINESS, status: "pending" })
    );
    render(await StudioBookingPage(props()));
    expect(screen.queryByRole("button", { name: BUSINESS_BUTTON })).toBeNull();
  });

  it("keeps Record deposit for an online deposit and hides the business one", async () => {
    asRole("admin");
    vi.mocked(getBooking).mockResolvedValue(
      detail({ deposit_to_business_minor: 0, status: "pending" })
    );
    render(await StudioBookingPage(props()));
    expect(screen.queryByRole("button", { name: BUSINESS_BUTTON })).toBeNull();
    expect(screen.getByRole("button", { name: RECORD })).toBeInTheDocument();
  });
});
