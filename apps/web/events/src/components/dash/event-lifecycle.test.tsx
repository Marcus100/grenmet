import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { cancelEvent, postponeEvent } from "@/data/actions";
import { EventLifecycle } from "./event-lifecycle";

const refresh = vi.fn();

vi.mock("@/data/actions", () => ({
  cancelEvent: vi.fn(),
  postponeEvent: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dash/events/evt",
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

function renderPanel() {
  render(
    <EventLifecycle
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
});
