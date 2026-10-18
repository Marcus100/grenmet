import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sellOutletTickets } from "@/data/actions";
import { parseMinor } from "@/domain/money";
import type { Outlet, Till } from "@/domain/types";
import { OutletConsole } from "./outlet-console";

const push = vi.fn();
const GENERAL = /General/;
const CASH_RECEIVED = /Cash received/;

vi.mock("@/data/actions", () => ({
  closeTill: vi.fn(),
  openTill: vi.fn(),
  sellOutletTickets: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dash/events/evt/outlet",
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const till: Till = {
  id: "till",
  staffName: "Dana",
  day: "2026-10-30",
  status: "open",
  openingFloatMinor: 10_000,
  openedAt: "2026-10-30T20:00:00Z",
  closedAt: null,
  salesCount: 0,
  ticketsSold: 0,
  collectedMinor: 0,
  cashRefundsMinor: 0,
  expectedMinor: 10_000,
  countedMinor: null,
  differenceMinor: null,
  closeNote: null,
};

const outlet: Outlet = {
  listingId: "evt",
  title: "Fete",
  startsAt: "2026-10-31T22:00:00Z",
  selling: true,
  till,
  sales: [],
  tiers: [
    {
      id: "tier",
      name: "General",
      priceMinor: 2500,
      currency: "XCD",
      allocation: 10,
      sold: 2,
      remaining: 8,
    },
  ],
};

describe("parseMinor", () => {
  it("reads dollars exactly and rejects anything else", () => {
    expect(parseMinor("25")).toBe(2500);
    expect(parseMinor("25.5")).toBe(2550);
    expect(parseMinor("1,250.05")).toBe(125_005);
    expect(parseMinor("")).toBeNull();
    expect(parseMinor("-1")).toBeNull();
    expect(parseMinor("1.234")).toBeNull();
  });
});

describe("OutletConsole", () => {
  it("only sells when the cash received matches the price total", async () => {
    vi.mocked(sellOutletTickets).mockResolvedValue({
      ok: true,
      data: {
        orderId: "order",
        listingId: "evt",
        listingTitle: "Fete",
        venue: "Carenage",
        startsAt: "2026-10-31T22:00:00Z",
        currency: "XCD",
        totalMinor: 5000,
        collectedMinor: 5000,
        buyerName: null,
        buyerPhone: null,
        soldByName: "Dana",
        createdAt: "2026-10-30T21:00:00Z",
        tickets: [],
      },
    });
    render(<OutletConsole outlet={outlet} />);
    fireEvent.change(screen.getByLabelText(GENERAL), {
      target: { value: "2" },
    });
    const sell = screen.getByRole("button", { name: "Sell and print" });
    fireEvent.change(screen.getByLabelText(CASH_RECEIVED), {
      target: { value: "40" },
    });
    expect(sell).toBeDisabled();
    fireEvent.change(screen.getByLabelText(CASH_RECEIVED), {
      target: { value: "50" },
    });
    expect(sell).toBeEnabled();
    fireEvent.click(sell);
    await vi.waitFor(() => expect(push).toHaveBeenCalled());
    expect(sellOutletTickets).toHaveBeenCalledWith(
      "evt",
      expect.objectContaining({
        amountCollectedMinor: 5000,
        items: [{ tierId: "tier", quantity: 2 }],
      })
    );
  });

  it("offers to open a till first", () => {
    render(<OutletConsole outlet={{ ...outlet, till: null }} />);
    expect(screen.getByText("Open your till")).toBeInTheDocument();
    expect(screen.queryByText("Sell tickets")).toBeNull();
  });
});
