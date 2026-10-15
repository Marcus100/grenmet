import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import NotFound from "./not-found";

// Button with render={<Link />}: it must reach assistive technology as a link.
it("offers a real link home, not a button", () => {
  render(<NotFound />);
  const home = screen.getByRole("link", { name: "Go back home" });
  expect(home.getAttribute("href")).toBe("/");
  expect(home.getAttribute("data-slot")).toBe("button");
  expect(screen.queryByRole("button", { name: "Go back home" })).toBeNull();
});
