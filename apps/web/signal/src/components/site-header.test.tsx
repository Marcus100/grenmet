import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./site-header";

describe("SiteHeader", () => {
  it("renders the primary navigation links and a subscribe action", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("link", { name: "Weather" })).toHaveAttribute(
      "href",
      "/weather-ready"
    );
    expect(screen.getByRole("link", { name: "Check D Ting" })).toHaveAttribute(
      "href",
      "/check-d-ting"
    );
    expect(screen.getByRole("link", { name: "Subscribe" })).toHaveAttribute(
      "href",
      "/#subscribe"
    );
  });
});
