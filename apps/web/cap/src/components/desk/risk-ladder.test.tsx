import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RiskLadder } from "./risk-ladder";

const SEVERITY = ["Unknown", "Minor", "Moderate", "Severe", "Extreme"] as const;

function radioFor(option: string): HTMLInputElement {
  const found = screen.getByRole("radio", { name: option });
  if (!(found instanceof HTMLInputElement)) {
    throw new Error(`${option} is not an input`);
  }
  return found;
}

describe("RiskLadder", () => {
  it("renders every option as a radio in one named group", () => {
    render(
      <RiskLadder
        label="Severity"
        onChange={vi.fn()}
        options={SEVERITY}
        value="Moderate"
      />
    );
    const group = screen.getByRole("group", { name: "Severity" });
    expect(group.querySelectorAll('input[type="radio"]')).toHaveLength(5);
    for (const option of SEVERITY) {
      expect(radioFor(option)).toBeInTheDocument();
    }
  });

  it("checks only the selected value", () => {
    render(
      <RiskLadder
        label="Urgency"
        onChange={vi.fn()}
        options={["Unknown", "Future", "Expected", "Immediate"] as const}
        value="Expected"
      />
    );
    expect(radioFor("Expected")).toBeChecked();
    expect(radioFor("Unknown")).not.toBeChecked();
    expect(radioFor("Immediate")).not.toBeChecked();
  });

  it("reports the clicked option", () => {
    const onChange = vi.fn();
    render(
      <RiskLadder
        label="Severity"
        onChange={onChange}
        options={SEVERITY}
        value="Minor"
      />
    );
    fireEvent.click(radioFor("Extreme"));
    expect(onChange).toHaveBeenCalledWith("Extreme");
  });

  it("lets the ladder shrink inside a column and wrap its options instead of overlapping", () => {
    render(
      <RiskLadder
        label="Certainty"
        onChange={vi.fn()}
        options={
          ["Unknown", "Unlikely", "Possible", "Likely", "Observed"] as const
        }
        value="Likely"
      />
    );
    const group = screen.getByRole("group", { name: "Certainty" });
    expect(group).toHaveClass("min-w-0");
    const firstOption = radioFor("Unknown").closest("label");
    expect(firstOption?.parentElement).toHaveClass("flex-wrap");
    expect(firstOption).toHaveClass("min-w-24");
  });

  it("shows the selected value once, not repeated beside the label", () => {
    render(
      <RiskLadder
        label="Severity"
        onChange={vi.fn()}
        options={SEVERITY}
        value="Severe"
      />
    );
    // The selected step is marked by its checked radio; no second copy of the value.
    expect(screen.getAllByText("Severe")).toHaveLength(1);
  });
});
