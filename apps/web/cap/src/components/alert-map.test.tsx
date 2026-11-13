import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlertMap } from "./alert-map";

const NO_ALERTS = /No alert areas are in effect/u;

describe("AlertMap", () => {
  it("draws the islands and no list when no alert is in force", () => {
    const { container } = render(<AlertMap features={[]} />);

    expect(screen.getByRole("img", { name: NO_ALERTS })).toBeInTheDocument();
    // One land path; an empty map must never look like a failed one.
    expect(container.querySelectorAll("svg path")).toHaveLength(1);
    expect(screen.getByText("St. George's")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    // Near the right edge, so its label is drawn to the left of the marker.
    expect(screen.getByText("Petite Martinique")).toHaveAttribute(
      "text-anchor",
      "end"
    );
    expect(screen.getByText("St. George's")).toHaveAttribute(
      "text-anchor",
      "start"
    );
  });
});
