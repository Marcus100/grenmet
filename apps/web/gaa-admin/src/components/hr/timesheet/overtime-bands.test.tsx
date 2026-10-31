import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OvertimeBands, overtimeBandsText } from "./overtime-bands";

describe("overtime bands", () => {
  it("lists hours per rate without trailing zeros", () => {
    expect(
      overtimeBandsText([
        { rate: "1.50", hours: "4.00" },
        { rate: "2", hours: "2.50" },
      ])
    ).toBe("4 h at 1.5x · 2.5 h at 2x");
  });

  it("says None rather than hiding the line", () => {
    render(<OvertimeBands bands={[]} />);
    expect(screen.getByText("Overtime by rate: None")).toBeInTheDocument();
  });
});
