import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TicketCancellation } from "./ticket-cancellation";

const REFUND_NOTE = /ask the organiser for a refund/;

vi.mock("@/data/actions", () => ({ cancelTicket: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/me/tickets/t1",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const props = { ticketId: "t1", title: "Big Fete" };

describe("TicketCancellation", () => {
  it("keeps Cancel for a free ticket", () => {
    render(<TicketCancellation {...props} canCancel paidOnline={false} />);
    expect(
      screen.getByRole("button", { name: "Cancel ticket" })
    ).toBeInTheDocument();
  });

  it("hides Cancel for an online-paid ticket and points to the organiser", () => {
    render(<TicketCancellation {...props} canCancel paidOnline />);
    expect(screen.queryByRole("button", { name: "Cancel ticket" })).toBeNull();
    expect(screen.getByText(REFUND_NOTE)).toBeInTheDocument();
  });

  it("shows nothing when the ticket can no longer be cancelled", () => {
    const { container } = render(
      <TicketCancellation {...props} canCancel={false} paidOnline />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
