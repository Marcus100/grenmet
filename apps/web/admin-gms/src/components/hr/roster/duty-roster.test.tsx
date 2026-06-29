import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DutyRoster } from "./duty-roster";

describe("DutyRoster", () => {
  it("renders every staff member and the shift legend", () => {
    render(<DutyRoster />);

    expect(screen.getByText("G. Tamar")).toBeInTheDocument();
    expect(screen.getByText("S. Paterson")).toBeInTheDocument();
    expect(screen.getByText("Vacation")).toBeInTheDocument();
  });

  it("cycles a cell through shift codes on click and clears all", async () => {
    const user = userEvent.setup();
    render(<DutyRoster />);

    const row = screen.getByText("G. Tamar").closest("tr");
    if (!row) {
      throw new Error("Expected a roster row for G. Tamar");
    }
    const firstCell = within(row).getAllByRole("button")[0];

    expect(firstCell.textContent).toBe("");
    await user.click(firstCell);
    expect(firstCell.textContent).toBe("M");
    await user.click(firstCell);
    expect(firstCell.textContent).toBe("E");

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(firstCell.textContent).toBe("");
  });
});
