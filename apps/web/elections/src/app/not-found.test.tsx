import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import NotFound from "./not-found";

it("explains the missing page and links home", () => {
  render(<NotFound />);
  expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Go to the home page" })
      .getAttribute("href")
  ).toBe("/");
});
