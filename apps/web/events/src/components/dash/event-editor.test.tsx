import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { emptyDraft } from "./event-draft";
import { EventEditor } from "./event-editor";

describe("EventEditor", () => {
  it("updates the public preview as the organiser types", () => {
    render(
      <EventEditor
        initial={emptyDraft(new Date("2026-10-03T12:00:00-04:00"))}
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
});
