import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { claimTickets } from "@/data/actions";
import type { EventDetail } from "@/domain/types";
import { claimableCount, TicketClaim } from "./ticket-claim";

const refresh = vi.fn();
const CLAIMED_TEXT = /You have 2 new tickets\./;
const PAYMENT_TEXT = /Online payment arrives/;
const SOLD_OUT_TEXT = /Sold out/;
const MORE_NAME = /More/;

vi.mock("@/data/actions", () => ({ claimTickets: vi.fn() }));
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

describe("claimableCount", () => {
  it("is the smaller of what is left and what the account may still hold", () => {
    expect(claimableCount(tier())).toBe(4);
    expect(claimableCount(tier({ held: 3 }))).toBe(1);
    expect(claimableCount(tier({ remaining: 2 }))).toBe(2);
    expect(claimableCount(tier({ held: 4 }))).toBe(0);
    expect(claimableCount(tier({ remaining: 0 }))).toBe(0);
  });

  it("is zero for paid tiers until online payment exists", () => {
    expect(
      claimableCount(tier({ price: { amountMinor: 5000, currency: "XCD" } }))
    ).toBe(0);
  });
});

describe("TicketClaim", () => {
  it("keeps the quantity within the limit and claims", async () => {
    vi.mocked(claimTickets).mockResolvedValue({ ok: true, data: 2 });
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
    expect(claimTickets).toHaveBeenCalledWith("free-night", [
      { tierId: "tier-1", quantity: 2 },
    ]);
    expect(await screen.findByText(CLAIMED_TEXT)).toBeInTheDocument();
  });

  it("shows paid and sold-out tiers without a picker", () => {
    render(
      <TicketClaim
        slug="mixed"
        tiers={[
          tier({
            id: "paid",
            name: "VIP",
            price: { amountMinor: 5000, currency: "XCD" },
          }),
          tier({ id: "gone", name: "Early", remaining: 0 }),
        ]}
      />
    );
    expect(screen.getByText(PAYMENT_TEXT)).toBeInTheDocument();
    expect(screen.getByText(SOLD_OUT_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: MORE_NAME })).toBeNull();
    expect(screen.getByRole("button", { name: "Get tickets" })).toBeDisabled();
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
