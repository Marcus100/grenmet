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
  }: {
    amountLabel: string;
    due: boolean;
  }) => (
    <button type="button">
      Record deposit {amountLabel} due={String(due)}
    </button>
  ),
}));

import { findOrganisation, getBooking } from "@/lib/studio-api";
import StudioBookingPage from "./page";

const RECORD = /Record deposit/;

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
    currency: "XCD",
    notes: "Allergic to lavender",
    cancel_reason: null,
    cancelled_at: null,
    created_at: "2026-10-18T12:00:00Z",
    deposit_intent_id: null,
    deposit_captured_minor: 0,
    deposit_refunded_minor: 0,
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
        expect(screen.queryByRole("button", { name: RECORD })).toBeNull();
      }
    );

    it("is not offered when there is no deposit", async () => {
      asRole("admin");
      vi.mocked(getBooking).mockResolvedValue(detail({ deposit_minor: 0 }));
      render(await StudioBookingPage(props()));
      expect(screen.queryByRole("button", { name: RECORD })).toBeNull();
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
});
