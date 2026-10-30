import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelOrder,
  recordManualPayment,
  refundOrder,
} from "@/data/order-actions";
import { makeOrderDetail } from "@/test/org-factories";
import { OrderActions } from "./order-actions";

const UUID = /^[0-9a-f-]{36}$/u;
const ALREADY_WAITING = /already waiting/u;
const RE_1 = /Only an order that is awaiting payment/u;
const RE_2 = /nothing left to refund/iu;
const RE_3 = /Payment recorded/u;
const RE_4 = /Refund XCD 150\.00 to the buyer/u;
const RE_5 = /between/u;
const RE_6 = /Follow the business policy/u;
const RE_7 = /at least 48 hours away/u;
const RE_8 = /Refund in full/u;
const RE_9 = /queued/u;
const RE_10 = /Do not refund/u;

const refresh = vi.fn();

const reportError = vi.fn();
vi.mock("@/lib/report-error", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));
vi.mock("@/data/order-actions", () => ({
  cancelOrder: vi.fn(),
  recordManualPayment: vi.fn(),
  refundOrder: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dash/events/e/orders/o",
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

const pending = makeOrderDetail({
  status: "pending_payment",
  paid_at: null,
  collected_minor: 0,
  payment: null,
  active_ticket_count: 0,
  tickets: [],
});

/** Every panel keeps its own (often empty) live region; read the filled ones. */
function live(role: "alert" | "status"): string {
  return screen
    .getAllByRole(role)
    .map((element) => element.textContent ?? "")
    .join("");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OrderActions panels", () => {
  it("always shows all three panels and says why one does not apply", () => {
    render(<OrderActions order={makeOrderDetail()} />);
    expect(
      screen.getByRole("heading", { name: "Record manual payment" })
    ).toBeInTheDocument();
    expect(screen.getByText(RE_1)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Refund" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Cancel order" })
    ).toBeInTheDocument();
  });

  it("explains the empty refund and cancel panels on an unpaid order", () => {
    render(<OrderActions order={pending} />);
    expect(screen.getByText(RE_2)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Record payment" })
    ).toBeEnabled();
  });
});

describe("manual payment", () => {
  it("sends method, reference and a key, then refreshes", async () => {
    vi.mocked(recordManualPayment).mockResolvedValue({
      ok: true,
      data: makeOrderDetail(),
    });
    render(<OrderActions order={pending} />);
    fireEvent.click(screen.getByRole("button", { name: "Bank transfer" }));
    fireEvent.change(screen.getByLabelText("Reference (optional)"), {
      target: { value: "TX-9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(recordManualPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: pending.id,
        method: "bank_transfer",
        reference: "TX-9",
        idempotencyKey: expect.stringMatching(UUID),
      })
    );
    expect(live("status")).toMatch(RE_3);
  });

  it("keeps the same key after a server fault and rotates it after a refusal", async () => {
    vi.mocked(recordManualPayment)
      .mockResolvedValueOnce({ ok: false, error: "boom", keepKey: true })
      .mockResolvedValueOnce({ ok: false, error: "boom", keepKey: true })
      .mockResolvedValueOnce({
        ok: false,
        error: "This order is already paid",
        keepKey: false,
      })
      .mockResolvedValueOnce({ ok: false, error: "again", keepKey: false });
    render(<OrderActions order={pending} />);
    const submit = screen.getByRole("button", { name: "Record payment" });
    const keys: string[] = [];
    for (let i = 0; i < 4; i++) {
      fireEvent.click(submit);
      await waitFor(() =>
        expect(recordManualPayment).toHaveBeenCalledTimes(i + 1)
      );
      await waitFor(() => expect(submit).toBeEnabled());
      keys.push(
        vi.mocked(recordManualPayment).mock.calls[i]?.[0].idempotencyKey ?? ""
      );
    }
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).toBe(keys[0]);
    expect(keys[3]).not.toBe(keys[2]);
    expect(live("alert")).toMatch("again");
  });

  it("locks the form after a fault and unlocks only when the person has checked the order", async () => {
    vi.mocked(recordManualPayment).mockResolvedValue({
      ok: false,
      error: "boom",
      keepKey: true,
    });
    const { rerender } = render(<OrderActions order={pending} />);
    const submit = screen.getByRole("button", { name: "Record payment" });
    fireEvent.click(submit);
    await waitFor(() => expect(recordManualPayment).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submit).toBeEnabled());
    expect(refresh).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Bank transfer" })
    ).toBeDisabled();
    expect(screen.getByLabelText("Reference (optional)")).toBeDisabled();
    rerender(<OrderActions order={{ ...pending }} />);
    expect(
      screen.getByRole("button", { name: "Bank transfer" })
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "I've checked the order, continue" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Bank transfer" }));
    fireEvent.click(submit);
    await waitFor(() => expect(recordManualPayment).toHaveBeenCalledTimes(2));
    const [first, second] = vi
      .mocked(recordManualPayment)
      .mock.calls.map(([call]) => call.idempotencyKey);
    expect(first).not.toBe(second);
  });

  it("keeps its outcome on screen after the refreshed order no longer allows it", async () => {
    vi.mocked(recordManualPayment).mockResolvedValue({
      ok: true,
      data: makeOrderDetail(),
    });
    const { rerender } = render(<OrderActions order={pending} />);
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    rerender(<OrderActions order={makeOrderDetail()} />);
    expect(
      screen.queryByRole("button", { name: "Record payment" })
    ).not.toBeInTheDocument();
    expect(live("status")).toContain("Payment recorded");
  });

  it("says the result is unconfirmed when the action throws", async () => {
    vi.mocked(recordManualPayment).mockRejectedValue(new Error("network"));
    render(<OrderActions order={pending} />);
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    await waitFor(() =>
      expect(live("alert")).toContain("We couldn't confirm this went through")
    );
    expect(refresh).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Record payment" })
    ).toBeEnabled();
  });
});

describe("refund", () => {
  const paid = makeOrderDetail();

  it("asks for confirmation before moving money", async () => {
    vi.mocked(refundOrder).mockResolvedValue({ ok: true, data: paid });
    render(<OrderActions order={paid} />);
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Buyer asked" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review refund" }));
    expect(refundOrder).not.toHaveBeenCalled();
    expect(screen.getByText(RE_4)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Confirm refund" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(refundOrder).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "Buyer asked", orderId: paid.id })
    );
    expect(vi.mocked(refundOrder).mock.calls[0]?.[0]).not.toHaveProperty(
      "amountMinor"
    );
  });

  it("refunds a partial amount in minor units", async () => {
    vi.mocked(refundOrder).mockResolvedValue({ ok: true, data: paid });
    render(<OrderActions order={paid} />);
    fireEvent.click(screen.getByRole("button", { name: "Partial amount" }));
    fireEvent.change(screen.getByLabelText("Amount to refund (XCD)"), {
      target: { value: "25.50" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Goodwill" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review refund" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm refund" }));
    await waitFor(() => expect(refundOrder).toHaveBeenCalled());
    expect(refundOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 2550 })
    );
  });

  it("refuses an amount above what is refundable, without calling the API", () => {
    render(<OrderActions order={paid} />);
    fireEvent.click(screen.getByRole("button", { name: "Partial amount" }));
    fireEvent.change(screen.getByLabelText("Amount to refund (XCD)"), {
      target: { value: "999" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Goodwill" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review refund" }));
    expect(live("alert")).toMatch(RE_5);
    expect(refundOrder).not.toHaveBeenCalled();
  });

  it("shows the API's refusal", async () => {
    vi.mocked(refundOrder).mockResolvedValue({
      ok: false,
      error:
        "A refund for this order is already waiting for the payment provider",
      keepKey: false,
    });
    render(<OrderActions order={paid} />);
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Buyer asked" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review refund" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm refund" }));
    await waitFor(() => expect(live("alert")).toMatch(ALREADY_WAITING));
  });
});

describe("cancel order", () => {
  it("defaults to the business policy and explains the 48 hour rule", () => {
    render(<OrderActions order={makeOrderDetail()} />);
    expect(screen.getByRole("radio", { name: RE_6 })).toBeChecked();
    expect(screen.getByText(RE_7)).toBeInTheDocument();
  });

  it("confirms, then cancels with the chosen refund", async () => {
    vi.mocked(cancelOrder).mockResolvedValue({
      ok: true,
      data: { order: makeOrderDetail(), outcome: "queued" },
    });
    render(<OrderActions order={makeOrderDetail()} />);
    fireEvent.click(screen.getByRole("radio", { name: RE_8 }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    expect(cancelOrder).not.toHaveBeenCalled();
    const buttons = await screen.findAllByRole("button", {
      name: "Cancel order",
    });
    const confirm = buttons.at(-1);
    expect(confirm).toBeDefined();
    if (confirm) {
      fireEvent.click(confirm);
    }
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(cancelOrder).toHaveBeenCalledWith({
      orderId: makeOrderDetail().id,
      refund: "full",
      reason: "",
    });
    expect(live("status")).toMatch(RE_9);
  });

  it("allows only no-refund for outlet cash", () => {
    render(
      <OrderActions
        order={makeOrderDetail({
          payment_method: "cash_outlet",
          payment: null,
        })}
      />
    );
    expect(screen.getByRole("radio", { name: RE_10 })).toBeChecked();
    expect(screen.getByRole("radio", { name: RE_8 })).toBeDisabled();
  });
});

describe("pending card refund", () => {
  it("disables the refund panel and says the refund is waiting", () => {
    render(
      <OrderActions order={makeOrderDetail({ refund_status: "queued" })} />
    );
    expect(
      screen.getByText("A card refund is waiting for the payment provider.", {
        exact: false,
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Review refund" })
    ).not.toBeInTheDocument();
  });
});

describe("outcomes persist across the refresh", () => {
  it("keeps the cancel outcome once the order is cancelled", async () => {
    vi.mocked(cancelOrder).mockResolvedValue({
      ok: true,
      data: { order: makeOrderDetail(), outcome: "kept" },
    });
    const { rerender } = render(<OrderActions order={makeOrderDetail()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    const buttons = await screen.findAllByRole("button", {
      name: "Cancel order",
    });
    const confirm = buttons.at(-1);
    if (confirm) {
      fireEvent.click(confirm);
    }
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    rerender(
      <OrderActions
        order={makeOrderDetail({ active_ticket_count: 0, refunded_minor: 0 })}
      />
    );
    expect(
      screen.getByText("This order is already cancelled or finished.")
    ).toBeInTheDocument();
    expect(live("status")).toContain("The money was kept");
  });

  it("keeps the refund outcome once nothing is left to refund", async () => {
    vi.mocked(refundOrder).mockResolvedValue({
      ok: true,
      data: makeOrderDetail({ refund_status: "refunded" }),
    });
    const { rerender } = render(<OrderActions order={makeOrderDetail()} />);
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Buyer asked" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review refund" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm refund" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    rerender(
      <OrderActions
        order={makeOrderDetail({
          status: "refunded",
          refund_status: "refunded",
          payment: null,
        })}
      />
    );
    expect(live("status")).toContain("Refund recorded");
  });
});

describe("refund lock after an uncertain failure", () => {
  const paid = makeOrderDetail();

  async function failRefund() {
    vi.mocked(refundOrder).mockResolvedValueOnce({
      ok: false,
      error: "We couldn't confirm this went through.",
      keepKey: true,
    });
    const view = render(<OrderActions order={paid} />);
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Buyer asked" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review refund" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm refund" }));
    await waitFor(() => expect(refundOrder).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    return view;
  }

  it("stays locked across a reload that shows no change", async () => {
    const { rerender } = await failRefund();
    expect(screen.getByLabelText("Reason")).toBeDisabled();
    rerender(<OrderActions order={{ ...paid }} />);
    expect(screen.getByLabelText("Reason")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "I've checked the order, continue" })
    ).toBeInTheDocument();
  });

  it("unlocks when the order shows a refund", async () => {
    const { rerender } = await failRefund();
    rerender(
      <OrderActions
        order={makeOrderDetail({
          refunded_minor: 5000,
          refund_status: "partial",
        })}
      />
    );
    expect(screen.getByLabelText("Reason")).toBeEnabled();
  });

  it("unlocks on the explicit confirmation, and a changed amount then gets a new key", async () => {
    const { rerender } = await failRefund();
    rerender(<OrderActions order={{ ...paid }} />);
    fireEvent.click(
      screen.getByRole("button", { name: "I've checked the order, continue" })
    );
    expect(screen.getByLabelText("Reason")).toBeEnabled();
    vi.mocked(refundOrder).mockResolvedValue({ ok: true, data: paid });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Different reason" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review refund" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm refund" }));
    await waitFor(() => expect(refundOrder).toHaveBeenCalledTimes(2));
    const [first, second] = vi
      .mocked(refundOrder)
      .mock.calls.map(([call]) => call.idempotencyKey);
    expect(first).not.toBe(second);
  });

  it("retries with the same key and body while locked", async () => {
    await failRefund();
    vi.mocked(refundOrder).mockResolvedValue({ ok: true, data: paid });
    fireEvent.click(screen.getByRole("button", { name: "Confirm refund" }));
    await waitFor(() => expect(refundOrder).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(refundOrder).mock.calls.map(([c]) => c);
    expect(second).toEqual(first);
  });
});
