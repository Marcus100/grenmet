import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  LISTING_ID,
  makeAttendee,
  makeOrderDetail,
  makeOrderRow,
} from "@/test/org-factories";
import { AttendeeList } from "./attendee-list";
import { OrderDetail } from "./order-detail";
import { OrderList } from "./order-list";

const RE_1 = /Ana Tester/;
const RE_2 = /Page 1 of 1/;
const RE_3 = /2 × General/;
const RE_4 = /No account email to show/;
const RE_5 = /No tickets issued yet/;
const RE_6 = /Not admitted yet/;
const RE_7 = /Admitted /;

describe("OrderList", () => {
  it("lists orders with status words and links to the detail", () => {
    render(
      <OrderList
        count={1}
        listingId={LISTING_ID}
        page={1}
        rows={[
          makeOrderRow(),
          makeOrderRow({ id: "x", status: "pending_payment" }),
        ]}
        status={undefined}
        totalPages={1}
      />
    );
    expect(screen.getAllByText("Paid").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Awaiting payment").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: RE_1 })[0]).toHaveAttribute(
      "href",
      expect.stringContaining("/orders/")
    );
  });

  it("shows an empty state and the filter and pager anyway", () => {
    render(
      <OrderList
        count={0}
        listingId={LISTING_ID}
        page={1}
        rows={[]}
        status="refunded"
        totalPages={1}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "No refunded orders on this event yet."
    );
    expect(
      screen.getByRole("navigation", { name: "Filter orders by status" })
    ).toBeInTheDocument();
    expect(screen.getByText(RE_2)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Refunded" })).toHaveAttribute(
      "aria-current",
      "true"
    );
  });

  it("links the next page and keeps the status filter", () => {
    render(
      <OrderList
        count={60}
        listingId={LISTING_ID}
        page={1}
        rows={[makeOrderRow()]}
        status="confirmed"
        totalPages={3}
      />
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      `/dash/events/${LISTING_ID}/orders?status=confirmed&page=2`
    );
  });
});

describe("OrderDetail", () => {
  it("shows contact, badges, items and tickets", () => {
    render(
      <OrderDetail order={makeOrderDetail({ refund_status: "queued" })} />
    );
    expect(screen.getByText("+1 473 555 0100")).toBeInTheDocument();
    expect(screen.getByText("ana@example.test")).toBeInTheDocument();
    expect(screen.getByText("Refund queued")).toBeInTheDocument();
    expect(screen.getByText(RE_3)).toBeInTheDocument();
    expect(screen.getByText("AAAAA-BBBBB")).toBeInTheDocument();
  });

  it("labels the refundable amount as pending while a refund is queued", () => {
    render(
      <OrderDetail order={makeOrderDetail({ refund_status: "queued" })} />
    );
    expect(
      screen.getByText("Still refundable (a refund is pending)")
    ).toBeInTheDocument();
  });

  it("reads a null email as not shown, not as missing", () => {
    render(<OrderDetail order={makeOrderDetail({ buyer_email: null })} />);
    expect(screen.getByText(RE_4)).toBeInTheDocument();
  });

  it("shows empty items and tickets sections", () => {
    render(<OrderDetail order={makeOrderDetail({ items: [], tickets: [] })} />);
    expect(screen.getByText("No items on this order.")).toBeInTheDocument();
    expect(screen.getByText(RE_5)).toBeInTheDocument();
  });
});

describe("AttendeeList", () => {
  const tiers = [{ id: "t1", name: "General" }];

  it("lists attendees with ticket status and admission", () => {
    render(
      <AttendeeList
        count={2}
        listingId={LISTING_ID}
        page={1}
        rows={[
          makeAttendee(),
          makeAttendee({
            ticket_id: "b",
            status: "refunded",
            admitted_at: "2026-10-30T22:30:00Z",
          }),
        ]}
        status={undefined}
        tierId={undefined}
        tiers={tiers}
        totalPages={1}
      />
    );
    expect(screen.getAllByText("Valid").length).toBeGreaterThan(1);
    expect(screen.getByText(RE_6)).toBeInTheDocument();
    expect(screen.getByText(RE_7)).toBeInTheDocument();
    expect(screen.getAllByText("Refunded").length).toBeGreaterThan(0);
  });

  it("keeps the tier filter when the status changes, and shows the empty state", () => {
    render(
      <AttendeeList
        count={0}
        listingId={LISTING_ID}
        page={1}
        rows={[]}
        status={undefined}
        tierId="t1"
        tiers={tiers}
        totalPages={1}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "No attendees match these filters."
    );
    expect(screen.getByRole("link", { name: "Cancelled" })).toHaveAttribute(
      "href",
      `/dash/events/${LISTING_ID}/attendees?tier=t1&status=cancelled`
    );
  });

  it("never calls a confirmed order with no valid tickets Paid", () => {
    render(
      <OrderList
        count={1}
        listingId={LISTING_ID}
        page={1}
        rows={[makeOrderRow({ active_ticket_count: 0 })]}
        status={undefined}
        totalPages={1}
      />
    );
    const list = within(screen.getByRole("list"));
    expect(list.getByText("Cancelled")).toBeInTheDocument();
    expect(list.queryByText("Paid")).not.toBeInTheDocument();
  });

  it("calls a free order Free and shows an unknown currency by code", () => {
    render(
      <OrderList
        count={1}
        listingId={LISTING_ID}
        page={1}
        rows={[
          makeOrderRow({
            payment_method: "none",
            total_minor: 2500,
            currency: "EUR",
          }),
        ]}
        status={undefined}
        totalPages={1}
      />
    );
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
    expect(screen.getByText("EUR 25.00")).toBeInTheDocument();
  });
});
