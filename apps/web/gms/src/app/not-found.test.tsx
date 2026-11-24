import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import NotFound from "./not-found";

it("explains the missing page and links home", () => {
  render(<NotFound />);
  expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Go to the forecast" })
      .getAttribute("href")
  ).toBe("/");
});

it("offers the site search, which goes to the search page", () => {
  render(<NotFound />);
  const box = screen.getByRole("searchbox", { name: "Search the site" });
  expect(box).toHaveAttribute("name", "q");
  expect(box).toHaveAttribute("maxlength", "200");
  expect(box.closest("form")).toHaveAttribute("action", "/search");
});
