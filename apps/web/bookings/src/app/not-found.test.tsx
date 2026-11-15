import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "./not-found";

describe("root not-found page", () => {
  it("is the page's main landmark, the target of the skip link", () => {
    render(<NotFound />);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(main).toContainElement(
      screen.getByRole("heading", { name: "Page not found" })
    );
  });
});
