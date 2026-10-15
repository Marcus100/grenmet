import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import NotFound from "./not-found";

// Button asChild around a Link: both actions must be links, styled as buttons.
it("offers real links home and to flights", () => {
  render(<NotFound />);
  expect(
    screen.getByRole("link", { name: "Back to home" }).getAttribute("href")
  ).toBe("/");
  expect(
    screen
      .getByRole("link", { name: "Flight information" })
      .getAttribute("href")
  ).toBe("/flights");
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});
