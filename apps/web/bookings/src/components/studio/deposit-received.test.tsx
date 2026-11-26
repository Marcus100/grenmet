import { formatDateTime } from "@barrelsgd/bookings-web/lib/booking-format";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKING_ID } from "@/test/studio";

const markDepositReceivedAction = vi.hoisted(() => vi.fn());
const undoDepositReceivedAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/studio/[orgSlug]/bookings/[id]/actions", () => ({
  markDepositReceivedAction,
  undoDepositReceivedAction,
}));

import { DepositReceived, type DepositReceivedProps } from "./deposit-received";

const ZONE = "America/Grenada";
const LATEST = "2027-01-05T09:45";
const RECEIVED_AT = "2027-01-05T13:30:00.000Z";
const MARK = { name: "Deposit received" };
const PAID_STRAIGHT = /EC\$53\.00 is paid straight to the business/u;
const RECEIVED_BY_BANK = /Deposit received · Bank transfer/u;

function ui(overrides: Partial<DepositReceivedProps> = {}) {
  return (
    <DepositReceived
      amountLabel="EC$53.00"
      bookingId={BOOKING_ID}
      canMark
      latest={LATEST}
      orgSlug="sea-salt"
      status="pending"
      timezone={ZONE}
      {...overrides}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deposit paid to the business, mark received", () => {
  it("offers the action with the amount and no Barrels payment wording", () => {
    render(ui());
    expect(screen.getByText(PAID_STRAIGHT)).toBeVisible();
    expect(screen.getByRole("button", MARK)).toBeVisible();
  });

  it("renders nothing when a receipt cannot be marked and none is recorded", () => {
    const { container } = render(ui({ canMark: false, status: "cancelled" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("asks for the method, an optional reference and an optional time with no later than now", async () => {
    render(ui());
    fireEvent.click(screen.getByRole("button", MARK));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Deposit: EC$53.00");
    expect(screen.getByLabelText("How was it paid?")).toHaveValue("cash");
    expect(
      Array.from(screen.getByLabelText("How was it paid?").children).map(
        (option) => option.textContent
      )
    ).toEqual(["Cash", "Bank transfer", "PayPal", "Other"]);
    expect(screen.getByLabelText("Reference (optional)")).toHaveAttribute(
      "maxlength",
      "100"
    );
    const when = screen.getByLabelText("When it arrived (optional)");
    expect(when).toHaveAttribute("type", "datetime-local");
    expect(when).toHaveAttribute("max", LATEST);
    expect(when).toHaveValue("");
  });

  it("sends the chosen method, reference and time, and announces the result", async () => {
    markDepositReceivedAction.mockResolvedValue({
      status: "success",
      message: "Deposit received.",
    });
    render(ui());
    fireEvent.click(screen.getByRole("button", MARK));
    fireEvent.change(await screen.findByLabelText("How was it paid?"), {
      target: { value: "bank_transfer" },
    });
    fireEvent.change(screen.getByLabelText("Reference (optional)"), {
      target: { value: "TX-9" },
    });
    fireEvent.change(screen.getByLabelText("When it arrived (optional)"), {
      target: { value: "2027-01-05T09:30" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Mark deposit received" })
    );

    const notice = await screen.findByText("Deposit received.");
    expect(notice).toHaveAttribute("role", "status");
    await waitFor(() => expect(notice).toHaveFocus());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    const [orgSlug, bookingId, , data] = markDepositReceivedAction.mock
      .calls[0] as [string, string, unknown, FormData];
    expect(orgSlug).toBe("sea-salt");
    expect(bookingId).toBe(BOOKING_ID);
    expect(data.get("method")).toBe("bank_transfer");
    expect(data.get("reference")).toBe("TX-9");
    expect(data.get("receivedAt")).toBe("2027-01-05T09:30");
  });

  it("shows a refusal in plain words, with the next step", async () => {
    markDepositReceivedAction.mockResolvedValue({
      status: "error",
      kind: "invalid",
      message: "The time the deposit arrived cannot be in the future.",
      nextStep: "Choose an earlier time, or leave it empty to use now.",
    });
    render(ui());
    fireEvent.click(screen.getByRole("button", MARK));
    fireEvent.click(
      await screen.findByRole("button", { name: "Mark deposit received" })
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "The time the deposit arrived cannot be in the future."
    );
    expect(alert).toHaveTextContent(
      "Choose an earlier time, or leave it empty to use now."
    );
  });
});

describe("deposit paid to the business, received", () => {
  const RECEIVED = {
    receivedAt: RECEIVED_AT,
    receivedMethod: "bank_transfer" as const,
    receivedReference: "TX-9",
  };

  it("shows the received line with the method, the business time and the reference", () => {
    render(ui({ ...RECEIVED, status: "confirmed" }));
    expect(
      screen.getByText(
        `Deposit received · Bank transfer · ${formatDateTime(RECEIVED_AT, ZONE)} · ref TX-9`
      )
    ).toBeVisible();
    expect(screen.queryByRole("button", MARK)).toBeNull();
  });

  it("omits the reference when there is none", () => {
    render(
      ui({
        ...RECEIVED,
        receivedMethod: "cash",
        receivedReference: null,
        status: "confirmed",
      })
    );
    expect(
      screen.getByText(
        `Deposit received · Cash · ${formatDateTime(RECEIVED_AT, ZONE)}`
      )
    ).toBeVisible();
  });

  it("offers Undo behind a confirm step while the booking is open", async () => {
    undoDepositReceivedAction.mockResolvedValue({
      status: "success",
      message: "Deposit receipt undone. The deposit is due again.",
    });
    render(ui({ ...RECEIVED, status: "pending" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Undo this receipt?");
    expect(undoDepositReceivedAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Undo receipt" }));
    expect(
      await screen.findByText(
        "Deposit receipt undone. The deposit is due again."
      )
    ).toHaveAttribute("role", "status");
    expect(undoDepositReceivedAction.mock.calls[0]?.slice(0, 2)).toEqual([
      "sea-salt",
      BOOKING_ID,
    ]);
  });

  it("keeps the received line but offers no Undo once the booking is cancelled", () => {
    render(ui({ ...RECEIVED, status: "cancelled" }));
    expect(screen.getByText(RECEIVED_BY_BANK)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });
});
