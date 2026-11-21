import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { saveListing } from "@/data/actions";

vi.mock("@/data/actions", () => ({
  finishUpload: vi.fn(),
  saveListing: vi.fn(),
  startUpload: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dash/events/new",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { emptyDraft } from "./event-draft";
import { EventEditor } from "./event-editor";

const PROTECTION_ACT = /Consumer Protection Act may still require refunds/u;

describe("EventEditor", () => {
  it("updates the public preview as the organiser types", () => {
    render(
      <EventEditor
        initial={emptyDraft(new Date("2026-10-03T12:00:00-04:00"))}
        listingId={null}
      />
    );
    const preview = screen.getByTestId("editor-preview");

    expect(within(preview).getByText("Untitled event")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Event name"), {
      target: { value: "Harbour Lights Fete" },
    });
    expect(
      within(preview).getByText("Harbour Lights Fete")
    ).toBeInTheDocument();
  });

  it("blocks publishing until the checklist is clear", () => {
    render(
      <EventEditor
        initial={emptyDraft(new Date("2026-10-03T12:00:00-04:00"))}
        listingId={null}
      />
    );
    const publish = screen.getByRole("button", { name: "Publish" });
    expect(publish).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Event name"), {
      target: { value: "Harbour Lights" },
    });
    fireEvent.change(screen.getByLabelText("Venue"), {
      target: { value: "Carenage" },
    });
    fireEvent.change(screen.getByLabelText("One-line summary"), {
      target: { value: "Lantern night on the water" },
    });
    expect(publish).toBeEnabled();
  });

  it("lets the organiser clear the category", () => {
    render(
      <EventEditor
        initial={emptyDraft(new Date("2026-10-03T12:00:00-04:00"))}
        listingId={null}
      />
    );
    const select = screen.getByLabelText("Category");
    expect(
      within(select).getByRole("option", { name: "No category" })
    ).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "" } });
    expect(select).toHaveValue("");
    const preview = screen.getByTestId("editor-preview");
    expect(within(preview).getByText("Uncategorised")).toBeInTheDocument();
  });
});

describe("refund terms", () => {
  const now = new Date("2026-10-03T12:00:00-04:00");

  function ticketedEditor() {
    render(<EventEditor initial={emptyDraft(now)} listingId={null} />);
    fireEvent.change(screen.getByLabelText("Admission"), {
      target: { value: "ticketed" },
    });
  }

  it("shows refund terms only for ticketed events", () => {
    render(<EventEditor initial={emptyDraft(now)} listingId={null} />);
    expect(screen.queryByLabelText("Refunds allowed")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Admission"), {
      target: { value: "ticketed" },
    });
    expect(screen.getByLabelText("Refunds allowed")).toHaveValue("refundable");
    expect(screen.getByLabelText("Refund deadline")).toHaveValue("default");
  });

  it("warns about no refunds and hides the deadline and fee", () => {
    ticketedEditor();
    fireEvent.change(screen.getByLabelText("Refunds allowed"), {
      target: { value: "no_refunds" },
    });
    expect(screen.getByText(PROTECTION_ACT)).toBeInTheDocument();
    expect(screen.queryByLabelText("Refund deadline")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cancellation fee")).not.toBeInTheDocument();
  });

  it("asks for a custom deadline in hours, clamped to 720", () => {
    ticketedEditor();
    fireEvent.change(screen.getByLabelText("Refund deadline"), {
      target: { value: "custom" },
    });
    fireEvent.change(screen.getByLabelText("Custom deadline (hours)"), {
      target: { value: "5000" },
    });
    expect(screen.getByLabelText("Custom deadline (hours)")).toHaveValue(720);
  });

  it("saves the chosen deadline and a fixed fee in minor units", async () => {
    vi.mocked(saveListing).mockResolvedValue({ ok: true, data: "evt-9" });
    ticketedEditor();
    fireEvent.change(screen.getByLabelText("Event name"), {
      target: { value: "Harbour Lights" },
    });
    fireEvent.change(screen.getByLabelText("Venue"), {
      target: { value: "Carenage" },
    });
    fireEvent.change(screen.getByLabelText("One-line summary"), {
      target: { value: "Lantern night on the water" },
    });
    fireEvent.change(screen.getByLabelText("Refund deadline"), {
      target: { value: "7d" },
    });
    fireEvent.change(screen.getByLabelText("Cancellation fee"), {
      target: { value: "fixed" },
    });
    fireEvent.change(screen.getByLabelText("Fee per ticket (EC$)"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await vi.waitFor(() =>
      expect(saveListing).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          refund_policy: "refundable",
          refund_cutoff_hours: 168,
          cancellation_fee_type: "fixed",
          cancellation_fee_value: 500,
        })
      )
    );
  });
});
