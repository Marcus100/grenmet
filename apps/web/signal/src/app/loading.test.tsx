import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import Loading from "./loading";

it("announces loading to assistive technology", () => {
  render(<Loading />);
  expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
});
