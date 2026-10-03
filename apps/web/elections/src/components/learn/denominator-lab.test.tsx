import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DenominatorLab } from "@/components/learn/denominator-lab";

describe("denominator lab", () => {
  it("explains three different percentages, handles zero and resets", () => {
    render(<DenominatorLab />);
    expect(screen.getByText("80.0%")).toBeInTheDocument();
    expect(screen.getByText("50.0%")).toBeInTheDocument();
    expect(screen.getByText("39.0%")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ballots cast: 800"), {
      target: { value: "0" },
    });
    expect(screen.getByText("Undefined")).toBeInTheDocument();
    expect(screen.getByLabelText("Votes for one candidate: 0")).toHaveAttribute(
      "max",
      "0"
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset example" }));
    expect(screen.getByText("50.0%")).toBeInTheDocument();
  });
});
