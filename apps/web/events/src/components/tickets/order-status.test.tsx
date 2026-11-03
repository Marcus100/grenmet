import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyOrder } from "@/domain/types";
import { OrderStatus, POLL_MS } from "./order-status";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

const NOW = new Date("2030-01-01T18:00:00Z");
const PAY_ORGANISER = /Pay the organiser/u;
const CHECKING = /Checking for your payment/u;
const TWO_CONFIRMED = /2 tickets confirmed/u;
const REFUNDED_AMOUNT = /EC\$100\.00 was refunded/u;

function order(overrides: Partial<MyOrder> = {}): MyOrder {
  return {
    id: "order-1",
    listingSlug: "big-fete",
    status: "pending_payment",
    paymentRequired: true,
    checkoutUrl: null,
    paymentExpiresAt: "2030-01-01T18:30:00Z",
    ticketIds: [],
    total: { amountMinor: 10_000, currency: "XCD" },
    ...overrides,
  };
}

describe("OrderStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    refresh.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts down and polls while awaiting payment", () => {
    render(<OrderStatus order={order()} />);
    expect(screen.getByText("Awaiting payment")).toBeInTheDocument();
    expect(screen.getByText("30:00")).toBeInTheDocument();
    expect(screen.getByText(PAY_ORGANISER)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(POLL_MS);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText("29:55")).toBeInTheDocument();
  });

  it("offers the checkout link when there is one", () => {
    render(
      <OrderStatus
        order={order({ checkoutUrl: "https://checkout.stripe.com/c/pay/x" })}
      />
    );
    expect(
      screen.getByRole("link", { name: "Continue to payment" })
    ).toHaveAttribute("href", "https://checkout.stripe.com/c/pay/x");
  });

  it("keeps waiting for the server once the hold has run out", () => {
    render(
      <OrderStatus
        order={order({ paymentExpiresAt: "2030-01-01T17:59:00Z" })}
      />
    );
    expect(screen.getByText(CHECKING)).toBeInTheDocument();
  });

  it("announces status in a live region and stops polling once confirmed", () => {
    const { rerender } = render(<OrderStatus order={order()} />);
    const region = screen.getByRole("status");
    rerender(
      <OrderStatus
        order={order({ status: "confirmed", ticketIds: ["t1", "t2"] })}
      />
    );
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("Payment received");
    expect(region).toHaveTextContent(TWO_CONFIRMED);
    expect(
      screen.getByRole("link", { name: "Open My tickets" })
    ).toHaveAttribute("href", "/me/tickets");
    refresh.mockClear();
    act(() => {
      vi.advanceTimersByTime(POLL_MS * 3);
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers another try when the order expired", () => {
    render(<OrderStatus order={order({ status: "expired" })} />);
    expect(screen.getByText("This order expired")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/events/big-fete"
    );
    act(() => {
      vi.advanceTimersByTime(POLL_MS * 2);
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a refunded order", () => {
    render(<OrderStatus order={order({ status: "refunded" })} />);
    expect(screen.getByText("This order was refunded")).toBeInTheDocument();
    expect(screen.getByText(REFUNDED_AMOUNT)).toBeInTheDocument();
  });
});
