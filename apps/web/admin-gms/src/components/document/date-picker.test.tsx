import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DatePicker } from "./date-picker";

describe("DatePicker", () => {
  it("shows a placeholder and marks itself empty when no value is set", () => {
    render(<DatePicker onChange={() => undefined} value="" />);

    expect(screen.getByText("Pick a date")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("data-empty", "true");
  });

  it("formats an ISO value as a long human date", () => {
    render(<DatePicker onChange={() => undefined} value="2026-06-15" />);

    expect(screen.getByText("June 15th, 2026")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("data-empty", "false");
  });

  it("falls back to the placeholder for an unparseable value", () => {
    render(<DatePicker onChange={() => undefined} value="not-a-date" />);

    expect(screen.getByText("Pick a date")).toBeInTheDocument();
  });
});
