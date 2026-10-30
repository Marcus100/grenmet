import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { WideContent } from "./wide-content";

it("marks its page as full width for the shell", () => {
  render(
    <WideContent className="space-y-5">
      <p>Register</p>
    </WideContent>
  );
  const wrapper = screen.getByText("Register").parentElement;
  expect(wrapper).toHaveAttribute("data-content-width", "wide");
  expect(wrapper).toHaveClass("space-y-5", "w-full");
});
