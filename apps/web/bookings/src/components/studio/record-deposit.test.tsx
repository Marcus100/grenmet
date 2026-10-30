import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKING_ID } from "@/test/studio";

const recordDepositAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/studio/[orgSlug]/bookings/[id]/actions", () => ({
  recordDepositAction,
}));

import { RecordDeposit } from "./record-deposit";

const UUID = /^[0-9a-f-]{36}$/u;
const TRIGGER = { name: "Record deposit received" };

function ui(due = true, takesDeposit = true) {
  return (
    <RecordDeposit
      amountLabel="EC$25.00"
      bookingId={BOOKING_ID}
      due={due}
      orgSlug="sea-salt"
      takesDeposit={takesDeposit}
    />
  );
}

const show = (due = true, takesDeposit = true) => render(ui(due, takesDeposit));

const key = () =>
  document.querySelector<HTMLInputElement>('input[name="idempotencyKey"]')
    ?.value;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("record deposit", () => {
  it("renders nothing when the deposit is not due", () => {
    const { container } = show(false);
    expect(container).toBeEmptyDOMElement();
  });

  it("confirms with the booking's amount as read-only text and a fresh key", async () => {
    show();
    fireEvent.click(screen.getByRole("button", TRIGGER));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Deposit received: EC$25.00"
    );
    expect(screen.getByLabelText("How was it paid?")).toHaveValue("cash");
    expect(
      Array.from(screen.getByLabelText("How was it paid?").children).map(
        (option) => option.textContent
      )
    ).toEqual(["Cash", "Bank transfer", "Cheque"]);
    expect(document.querySelector('input[name="amount"]')).toBeNull();
    expect(key()).toMatch(UUID);
  });

  it("announces success, closes the dialog and keeps the notice", async () => {
    recordDepositAction.mockResolvedValue({
      status: "done",
      message: "Deposit recorded.",
    });
    const { rerender } = show();
    fireEvent.click(screen.getByRole("button", TRIGGER));
    fireEvent.click(
      await screen.findByRole("button", { name: "Record deposit" })
    );
    const notice = await screen.findByText("Deposit recorded.");
    expect(notice).toHaveAttribute("role", "status");
    await waitFor(() => expect(notice).toHaveFocus());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    // The page refreshes with the deposit paid: the button goes, the notice stays.
    rerender(ui(false));
    expect(screen.queryByRole("button", TRIGGER)).toBeNull();
    expect(screen.getByText("Deposit recorded.")).toBeInTheDocument();
  });

  it("rotates the key after a refusal and keeps it after a server fault", async () => {
    recordDepositAction.mockResolvedValue({
      status: "error",
      kind: "invalid",
      message: "The deposit was not accepted.",
      nextStep: "The page has refreshed.",
    });
    show();
    fireEvent.click(screen.getByRole("button", TRIGGER));
    const first = key();
    fireEvent.click(
      await screen.findByRole("button", { name: "Record deposit" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("not accepted");
    await waitFor(() => expect(key()).not.toBe(first));

    recordDepositAction.mockResolvedValue({
      status: "error",
      kind: "unavailable",
      message: "We could not save that change.",
      nextStep: "Try again in a moment.",
    });
    const second = key();
    fireEvent.click(screen.getByRole("button", { name: "Record deposit" }));
    await screen.findByText("We could not save that change.");
    expect(key()).toBe(second);
  });

  it("sends the chosen method and reference, never an amount", async () => {
    recordDepositAction.mockResolvedValue({ status: "idle" });
    show();
    fireEvent.click(screen.getByRole("button", TRIGGER));
    fireEvent.change(await screen.findByLabelText("How was it paid?"), {
      target: { value: "cheque" },
    });
    fireEvent.change(screen.getByLabelText("Reference (optional)"), {
      target: { value: "CH-7" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record deposit" }));
    await waitFor(() => expect(recordDepositAction).toHaveBeenCalled());
    const data = recordDepositAction.mock.calls[0]?.[3] as FormData;
    expect(data.get("method")).toBe("cheque");
    expect(data.get("reference")).toBe("CH-7");
    expect(data.has("amount")).toBe(false);
  });

  it("renders nothing when the booking takes no deposit", () => {
    const { container } = show(true, false);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps a page-level refusal visible and focused after the page refreshes", async () => {
    recordDepositAction.mockResolvedValue({
      status: "error",
      kind: "conflict",
      message: "The deposit has already been paid.",
      nextStep: "The page has refreshed.",
    });
    const { rerender } = show();
    fireEvent.click(screen.getByRole("button", TRIGGER));
    fireEvent.click(
      await screen.findByRole("button", { name: "Record deposit" })
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    );
    rerender(ui(false, false));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("already been paid");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.queryByRole("button", TRIGGER)).toBeNull();
  });

  it("keeps the key when the dialog is closed and reopened", async () => {
    show();
    fireEvent.click(screen.getByRole("button", TRIGGER));
    const first = key();
    fireEvent.click(await screen.findByRole("button", { name: "Go back" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", TRIGGER));
    await screen.findByRole("alertdialog");
    expect(key()).toBe(first);
  });

  it("keeps submit off while there is no key", async () => {
    const spy = vi.spyOn(crypto, "randomUUID").mockReturnValue("" as never);
    show();
    fireEvent.click(screen.getByRole("button", TRIGGER));
    expect(
      await screen.findByRole("button", { name: "Record deposit" })
    ).toBeDisabled();
    spy.mockRestore();
  });

  it("keeps the typed reference after a refusal", async () => {
    recordDepositAction.mockResolvedValue({
      status: "error",
      kind: "unavailable",
      message: "We could not save that change.",
      nextStep: "Try again in a moment.",
    });
    show();
    fireEvent.click(screen.getByRole("button", TRIGGER));
    fireEvent.change(await screen.findByLabelText("Reference (optional)"), {
      target: { value: "CHQ-1042" },
    });
    fireEvent.change(screen.getByLabelText("How was it paid?"), {
      target: { value: "cheque" },
    });
    const firstKey = key();
    fireEvent.click(screen.getByRole("button", { name: "Record deposit" }));
    await screen.findByText("We could not save that change.");
    const sent = recordDepositAction.mock.calls[0]?.[3] as FormData;
    expect(sent.get("idempotencyKey")).toBe(firstKey);
    expect(sent.get("reference")).toBe("CHQ-1042");
    expect(screen.getByLabelText("Reference (optional)")).toHaveValue(
      "CHQ-1042"
    );
    expect(screen.getByLabelText("How was it paid?")).toHaveValue("cheque");
  });
});
