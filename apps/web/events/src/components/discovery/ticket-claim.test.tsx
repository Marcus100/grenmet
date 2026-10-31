import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimTickets } from "@/data/actions";
import type { EventDetail, MyOrder } from "@/domain/types";
import { goToCheckout } from "@/lib/navigation";
import { claimableCount, TicketClaim } from "./ticket-claim";

const refresh = vi.fn();
const CLAIMED_TEXT = /You have 2 new tickets\./;
const SOLD_OUT_TEXT = /Sold out/;
const MORE_NAME = /More/;
const PRICE_TEXT = /EC\$50\.00/;
const OLD_NOTE = /Online payment arrives/;
const RESERVED_TEXT = /Reserved, awaiting payment/;
const PAY_ORGANISER_TEXT = /Pay the organiser/;
const EXPIRY_TEXT = /holding your tickets until/;

vi.mock("@/data/actions", () => ({ claimTickets: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ goToCheckout: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/events/free-night",
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

type Tier = EventDetail["tiers"][number];

function tier(overrides: Partial<Tier> = {}): Tier {
  return {
    id: "tier-1",
    name: "Registration",
    allocation: 100,
    held: 0,
    perAccountLimit: 4,
    remaining: 100,
    price: { amountMinor: 0, currency: "XCD" },
    ...overrides,
  };
}

const paidTier = tier({
  id: "paid",
  name: "VIP",
  price: { amountMinor: 5000, currency: "XCD" },
});

function order(overrides: Partial<MyOrder> = {}): MyOrder {
  return {
    id: "order-1",
    listingSlug: "mixed",
    status: "confirmed",
    paymentRequired: false,
    checkoutUrl: null,
    paymentExpiresAt: null,
    ticketIds: [],
    total: { amountMinor: 5000, currency: "XCD" },
    ...overrides,
  };
}

function orderOneVip() {
  fireEvent.click(screen.getByRole("button", { name: "More VIP tickets" }));
  fireEvent.click(screen.getByRole("button", { name: "Pay for 1 ticket" }));
}

beforeEach(() => {
  vi.mocked(claimTickets).mockReset();
  vi.mocked(goToCheckout).mockReset();
});

describe("claimableCount", () => {
  it("is the smaller of what is left and what the account may still hold", () => {
    expect(claimableCount(tier())).toBe(4);
    expect(claimableCount(tier({ held: 3 }))).toBe(1);
    expect(claimableCount(tier({ remaining: 2 }))).toBe(2);
    expect(claimableCount(tier({ held: 4 }))).toBe(0);
    expect(claimableCount(tier({ remaining: 0 }))).toBe(0);
  });

  it("allows paid tiers like any other", () => {
    expect(claimableCount(paidTier)).toBe(4);
  });
});

describe("TicketClaim", () => {
  it("keeps the quantity within the limit and claims", async () => {
    vi.mocked(claimTickets).mockResolvedValue({
      ok: true,
      data: order({ ticketIds: ["a", "b"] }),
    });
    render(<TicketClaim slug="free-night" tiers={[tier({ held: 2 })]} />);

    const more = screen.getByRole("button", {
      name: "More Registration tickets",
    });
    fireEvent.click(more);
    fireEvent.click(more);
    fireEvent.click(more);
    expect(more).toBeDisabled();
    expect(screen.getByLabelText("Registration tickets")).toHaveTextContent(
      "2"
    );

    fireEvent.click(screen.getByRole("button", { name: "Get 2 tickets" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(claimTickets).toHaveBeenCalledWith(
      "free-night",
      [{ tierId: "tier-1", quantity: 2 }],
      undefined
    );
    expect(await screen.findByText(CLAIMED_TEXT)).toBeInTheDocument();
  });

  it("lets a paid tier be chosen and shows its price", () => {
    render(
      <TicketClaim
        slug="mixed"
        tiers={[paidTier, tier({ id: "gone", name: "Early", remaining: 0 })]}
      />
    );
    expect(screen.getByText(PRICE_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(OLD_NOTE)).toBeNull();
    expect(screen.getByText(SOLD_OUT_TEXT)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: MORE_NAME })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "More VIP tickets" }));
    expect(
      screen.getByRole("button", { name: "Pay for 1 ticket" })
    ).toBeEnabled();
  });

  it("reuses the Idempotency-Key when the same paid basket is retried", async () => {
    vi.mocked(claimTickets).mockResolvedValue({
      ok: false,
      error: "Something went wrong. Try again shortly.",
    });
    render(<TicketClaim slug="mixed" tiers={[paidTier]} />);
    fireEvent.click(screen.getByRole("button", { name: "More VIP tickets" }));
    const pay = screen.getByRole("button", { name: "Pay for 1 ticket" });
    fireEvent.click(pay);
    await screen.findByRole("alert");
    fireEvent.click(pay);
    await vi.waitFor(() => expect(claimTickets).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(claimTickets).mock.calls;
    expect(first?.[2]).toBeTruthy();
    expect(second?.[2]).toBe(first?.[2]);

    // A different basket is a different order, so it gets a new key.
    await vi.waitFor(() =>
      expect(
        screen.getByRole("button", { name: "More VIP tickets" })
      ).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "More VIP tickets" }));
    fireEvent.click(screen.getByRole("button", { name: "Pay for 2 tickets" }));
    await vi.waitFor(() => expect(claimTickets).toHaveBeenCalledTimes(3));
    const third = vi.mocked(claimTickets).mock.calls[2];
    expect(third?.[2]).toBeTruthy();
    expect(third?.[2]).not.toBe(first?.[2]);
  });

  it("keeps the Idempotency-Key after a bare server error so a retry replays the order", async () => {
    vi.mocked(claimTickets).mockResolvedValue({
      ok: false,
      error: "Something went wrong. Try again shortly.",
    });
    render(<TicketClaim slug="mixed" tiers={[paidTier]} />);
    fireEvent.click(screen.getByRole("button", { name: "More VIP tickets" }));
    const pay = screen.getByRole("button", { name: "Pay for 1 ticket" });
    fireEvent.click(pay);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong"
    );
    await vi.waitFor(() => expect(pay).toBeEnabled());
    fireEvent.click(pay);
    await vi.waitFor(() => expect(claimTickets).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(claimTickets).mock.calls;
    expect(first?.[2]).toBeTruthy();
    expect(second?.[2]).toBe(first?.[2]);
  });

  it("drops the Idempotency-Key when card payment is unavailable so a retry starts a new order", async () => {
    vi.mocked(claimTickets).mockResolvedValue({
      ok: false,
      error:
        "Card payments are temporarily unavailable. Try again in a moment.",
      freshKey: true,
    });
    render(<TicketClaim slug="mixed" tiers={[paidTier]} />);
    fireEvent.click(screen.getByRole("button", { name: "More VIP tickets" }));
    const pay = screen.getByRole("button", { name: "Pay for 1 ticket" });
    fireEvent.click(pay);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Card payments are temporarily unavailable"
    );
    await vi.waitFor(() => expect(pay).toBeEnabled());
    fireEvent.click(pay);
    await vi.waitFor(() => expect(claimTickets).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(claimTickets).mock.calls;
    expect(first?.[2]).toBeTruthy();
    expect(second?.[2]).toBeTruthy();
    expect(second?.[2]).not.toBe(first?.[2]);
  });

  it("goes to the checkout page for an online payment", async () => {
    vi.mocked(claimTickets).mockResolvedValue({
      ok: true,
      data: order({
        status: "pending_payment",
        paymentRequired: true,
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1",
      }),
    });
    render(<TicketClaim slug="mixed" tiers={[paidTier]} />);
    orderOneVip();
    await vi.waitFor(() =>
      expect(goToCheckout).toHaveBeenCalledWith(
        "https://checkout.stripe.com/c/pay/cs_test_1"
      )
    );
  });

  it("never follows a checkout link that is not http(s)", async () => {
    vi.mocked(claimTickets).mockResolvedValue({
      ok: true,
      data: order({
        status: "pending_payment",
        paymentRequired: true,
        checkoutUrl: "javascript:alert(1)",
      }),
    });
    render(<TicketClaim slug="mixed" tiers={[paidTier]} />);
    orderOneVip();
    expect(await screen.findByText(RESERVED_TEXT)).toBeInTheDocument();
    expect(goToCheckout).not.toHaveBeenCalled();
  });

  it("shows a reserved state when the organiser records payment by hand", async () => {
    vi.mocked(claimTickets).mockResolvedValue({
      ok: true,
      data: order({
        id: "order-9",
        status: "pending_payment",
        paymentRequired: true,
        checkoutUrl: null,
        paymentExpiresAt: "2030-01-01T18:30:00Z",
      }),
    });
    render(<TicketClaim slug="mixed" tiers={[paidTier]} />);
    orderOneVip();
    expect(await screen.findByText(RESERVED_TEXT)).toBeInTheDocument();
    expect(screen.getByText(EXPIRY_TEXT)).toHaveTextContent("2:30 PM");
    expect(screen.getByText(PAY_ORGANISER_TEXT)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View this order" })
    ).toHaveAttribute("href", "/me/orders/order-9");
  });

  it("shows the API's message when a claim is refused", async () => {
    vi.mocked(claimTickets).mockResolvedValue({
      ok: false,
      error: "Registration is sold out",
    });
    render(<TicketClaim slug="free-night" tiers={[tier()]} />);
    fireEvent.click(
      screen.getByRole("button", { name: "More Registration tickets" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Get 1 ticket" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("sold out");
  });
});
