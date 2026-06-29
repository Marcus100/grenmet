import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DutyRoster } from "./duty-roster";

describe("DutyRoster", () => {
  it("renders every staff member and the shift legend", () => {
    render(<DutyRoster />);

    expect(screen.getByText("G. Tamar")).toBeInTheDocument();
    expect(screen.getByText("S. Paterson")).toBeInTheDocument();
    expect(screen.getByText("Vacation")).toBeInTheDocument();
  });

  it("cycles a cell through shift codes on click and clears all", () => {
    // Synchronous fireEvent (not userEvent) so each state update flushes before
    // the next assertion — keeps this click-heavy test deterministic under load.
    render(<DutyRoster />);

    const row = screen.getByText("G. Tamar").closest("tr");
    if (!row) {
      throw new Error("Expected a roster row for G. Tamar");
    }
    const firstCell = within(row).getAllByRole("button")[0];

    expect(firstCell.textContent).toBe("");
    fireEvent.click(firstCell);
    expect(firstCell.textContent).toBe("M");
    fireEvent.click(firstCell);
    expect(firstCell.textContent).toBe("E");

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(firstCell.textContent).toBe("");
    // Generous timeout: rendering/re-rendering the full month grid (~570 cells)
    // in jsdom is slow and can exceed the 5s default under parallel CPU load.
  }, 20_000);
});
