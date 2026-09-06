import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RightNow } from "@/components/right-now";
import { CURRENT_CONDITIONS } from "@/lib/forecast-data";

describe("RightNow", () => {
  it("shows the current temperature, condition, and feels-like line", () => {
    const { container } = render(<RightNow />);
    expect(
      screen.getByText(`${CURRENT_CONDITIONS.temperature}°C`)
    ).toBeInTheDocument();
    expect(
      screen.getByText(CURRENT_CONDITIONS.conditionLabel)
    ).toBeInTheDocument();
    expect(container.textContent).toContain(
      `Feels like ${CURRENT_CONDITIONS.feelsLike}°`
    );
    expect(container.textContent).toContain(CURRENT_CONDITIONS.wind);
  });
});
