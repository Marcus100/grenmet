import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EXAMPLE_BOOKING_PATH } from "@/lib/example-booking";
import HomePage from "./page";

const NO_BUSINESS_LIST = /There is no list of businesses here yet/u;

describe("home page", () => {
  it("explains how customers find a business, without inventing a list", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Online appointments for Grenada businesses",
      })
    ).toBeInTheDocument();
    expect(screen.getByText(NO_BUSINESS_LIST)).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("links to an example booking page", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("link", { name: "see an example booking page" })
    ).toHaveAttribute("href", EXAMPLE_BOOKING_PATH);
  });

  it("puts For businesses in the header corner, pointing at the studio", () => {
    render(<HomePage />);
    const link = screen.getByRole("link", { name: "For businesses" });
    expect(link).toHaveAttribute("href", "/studio");
    expect(link.closest("header")).not.toBeNull();
  });
});
