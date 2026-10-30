import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SectorCheckboxes } from "./sector-checkboxes";

const AFFECTS_EVERYONE = /Affects everyone/;
const ONLY_TICKED = /only under the ticked sectors/;
const SIX = [
  "Tourism & outdoors",
  "Marine",
  "Aviation",
  "Agriculture",
  "Health",
  "Roads & transport",
];

describe("SectorCheckboxes", () => {
  it("offers the six sectors and explains that none ticked affects everyone", () => {
    render(<SectorCheckboxes onChange={vi.fn()} value={[]} />);
    for (const name of SIX)
      expect(screen.getByRole("checkbox", { name })).not.toBeChecked();
    expect(screen.getByText(AFFECTS_EVERYONE)).toBeInTheDocument();
  });

  it("shows the ticked sectors and says where they show", () => {
    render(
      <SectorCheckboxes onChange={vi.fn()} value={["marine", "health"]} />
    );
    expect(screen.getByRole("checkbox", { name: "Marine" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Health" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Aviation" })
    ).not.toBeChecked();
    expect(screen.getByText(ONLY_TICKED)).toBeInTheDocument();
  });

  it("reports the new choice in menu order, however it was ticked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SectorCheckboxes onChange={onChange} value={["health"]} />);
    await user.click(
      screen.getByRole("checkbox", { name: "Tourism & outdoors" })
    );
    expect(onChange).toHaveBeenLastCalledWith(["tourism", "health"]);
    await user.click(screen.getByRole("checkbox", { name: "Health" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
