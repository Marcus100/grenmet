import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { cancelEvent, postponeEvent } from "@/data/actions";
import { cancelEventWithRefund } from "@/data/order-actions";
import { EventLifecycle } from "./event-lifecycle";

const MAY_HAVE_GONE = "The cancel may have gone through";
const RE_1 = /Follow the business policy/u;
const RE_2 = /Refund in full/u;
const RE_3 = /moves no money/u;

const refresh = vi.fn();

vi.mock("@/data/actions", () => ({
  cancelEvent: vi.fn(),
  postponeEvent: vi.fn(),
}));
vi.mock("@/data/order-actions", () => ({ cancelEventWithRefund: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dash/events/evt",
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

function renderPanel(canChooseRefund = false) {
  render(
    <EventLifecycle
      canChooseRefund={canChooseRefund}
      date="2026-11-07"
      endTime="23:00"
      listingId="evt"
      startTime="19:00"
      title="Fete"
    />
  );
}

describe("EventLifecycle", () => {
  it("postpones with Grenada-time instants", async () => {
    vi.mocked(postponeEvent).mockResolvedValue({ ok: true, data: undefined });
    renderPanel();
    fireEvent.change(screen.getByLabelText("New date"), {
      target: { value: "2026-11-14" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Postpone" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(postponeEvent).toHaveBeenCalledWith(
      "evt",
      "2026-11-14T19:00:00-04:00",
      "2026-11-14T23:00:00-04:00"
    );
  });

  it("asks before cancelling and reports the tickets cancelled", async () => {
    vi.mocked(cancelEvent).mockResolvedValue({
      ok: true,
      data: { ticketsCancelled: 3 },
    });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Cancel event" }));
    expect(cancelEvent).not.toHaveBeenCalled();
    const buttons = await screen.findAllByRole("button", {
      name: "Cancel event",
    });
    const confirm = buttons.at(-1);
    expect(confirm).toBeDefined();
    if (confirm) {
      fireEvent.click(confirm);
    }
    expect(await screen.findByRole("status")).toHaveTextContent(
      "3 tickets cancelled"
    );
  });

  it("with an organisation, offers the refund choice and shows the result counts", async () => {
    vi.mocked(cancelEventWithRefund).mockResolvedValue({
      ok: true,
      data: {
        ticketsCancelled: 4,
        ordersQueued: 2,
        ordersRefunded: 0,
        ordersReleased: 1,
        ordersKept: 0,
        refundsFailed: 1,
      },
    });
    renderPanel(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel event" }));
    expect(await screen.findByRole("radio", { name: RE_1 })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: RE_2 }));
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel and refund everyone" })
    );
    const summary = await screen.findByRole("status");
    expect(cancelEventWithRefund).toHaveBeenCalledWith("evt", "full");
    expect(summary).toHaveTextContent("2 orders queued for a card refund");
    expect(summary).toHaveTextContent("1 unpaid order released");
    expect(summary).toHaveTextContent("1 refund failed");
    expect(cancelEvent).not.toHaveBeenCalled();
  });

  it("says the cancel may have gone through after an unconfirmed failure", async () => {
    vi.mocked(cancelEventWithRefund).mockResolvedValue({
      ok: false,
      error: "We couldn't confirm this went through.",
      keepKey: true,
    });
    renderPanel(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel event" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancel and follow policy" })
    );
    expect(
      await screen.findByText(MAY_HAVE_GONE, { exact: false })
    ).toBeVisible();
    expect(refresh).toHaveBeenCalled();
  });

  it("without an organisation, says no money moves", async () => {
    renderPanel(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancel event" }));
    expect(await screen.findByText(RE_3)).toBeInTheDocument();
  });
});
