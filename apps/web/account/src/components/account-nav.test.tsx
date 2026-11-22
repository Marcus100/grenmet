import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountNav } from "./account-nav";

describe("AccountNav", () => {
  it("gives each section link a 44 px tap target", () => {
    render(<AccountNav current="profile" />);

    for (const name of ["Profile", "My bookings"]) {
      expect(screen.getByRole("link", { name }).className).toContain(
        "min-h-11"
      );
    }
  });

  it("marks the current section with aria-current", () => {
    render(<AccountNav current="bookings" />);

    expect(screen.getByRole("link", { name: "My bookings" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Profile" })).not.toHaveAttribute(
      "aria-current"
    );
  });
});
