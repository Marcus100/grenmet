import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { admitTicket } from "@/data/actions";
import type { DoorManifest } from "@/domain/types";
import { DoorConsole } from "./door-console";

const refresh = vi.fn();
const ADMITTED_TEXT = /Ben Tester · Free/;

vi.mock("@/data/actions", () => ({ admitTicket: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dash/events/evt/door",
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

const manifest: DoorManifest = {
  listingId: "evt",
  title: "Free Night",
  startsAt: "2026-10-30T22:00:00Z",
  generatedAt: "2026-10-30T20:00:00Z",
  issued: 2,
  admitted: 1,
  waiting: 1,
  cancelled: 0,
  rows: [
    {
      ticketId: "t1",
      code: "AAAAA-BBBBB",
      holderName: "Ana Tester",
      tierName: "Free",
      admittedAt: "2026-10-30T22:30:00Z",
    },
    {
      ticketId: "t2",
      code: "CCCCC-DDDDD",
      holderName: "Ben Tester",
      tierName: "Free",
      admittedAt: null,
    },
  ],
};

describe("DoorConsole", () => {
  it("shows live counts and the door list", () => {
    render(<DoorConsole listingId="evt" manifest={manifest} />);
    expect(screen.getByText("Admitted")).toBeInTheDocument();
    expect(screen.getByText("Still to come")).toBeInTheDocument();
    expect(screen.getByText("Ana Tester")).toBeInTheDocument();
    expect(screen.getByText("Ben Tester")).toBeInTheDocument();
  });

  it("admits the code a keyboard scanner types, then clears the field", async () => {
    vi.mocked(admitTicket).mockResolvedValue({
      ok: true,
      data: {
        code: "CCCCC-DDDDD",
        tierName: "Free",
        holderName: "Ben Tester",
        admittedAt: "2026-10-30T22:40:00Z",
        admittedByName: "Door Staff",
        repeat: false,
      },
    });
    render(<DoorConsole listingId="evt" manifest={manifest} />);
    const field = screen.getByLabelText("Scan or enter a ticket code");
    fireEvent.change(field, { target: { value: "ccccc-ddddd" } });
    fireEvent.submit(field);

    expect(await screen.findByText(ADMITTED_TEXT)).toBeInTheDocument();
    expect(admitTicket).toHaveBeenCalledWith(
      "evt",
      "ccccc-ddddd",
      expect.any(String)
    );
    expect(field).toHaveValue("");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the duplicate message from the API", async () => {
    vi.mocked(admitTicket).mockResolvedValue({
      ok: false,
      error: "Already admitted at 18:30 by Door Staff",
    });
    render(<DoorConsole listingId="evt" manifest={manifest} />);
    const field = screen.getByLabelText("Scan or enter a ticket code");
    fireEvent.change(field, { target: { value: "AAAAA-BBBBB" } });
    fireEvent.submit(field);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Already admitted at 18:30 by Door Staff"
    );
  });

  it("finds a ticket by name for manual lookup", () => {
    render(<DoorConsole listingId="evt" manifest={manifest} />);
    fireEvent.change(screen.getByLabelText("Find by name or code"), {
      target: { value: "ben" },
    });
    expect(screen.queryByText("Ana Tester")).toBeNull();
    expect(screen.getByText("Ben Tester")).toBeInTheDocument();
  });
});
