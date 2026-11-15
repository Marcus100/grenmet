import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PageTransition } from "./page-transition";

afterEach(cleanup);

it("renders its children with no motion wrapper", () => {
  const { container } = render(
    <PageTransition>
      <p>HR dashboard</p>
    </PageTransition>
  );
  expect(screen.getByText("HR dashboard")).toBeInTheDocument();
  expect(container.firstElementChild).toBe(screen.getByText("HR dashboard"));
});
