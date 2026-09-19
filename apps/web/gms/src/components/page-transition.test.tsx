import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PageTransition } from "./page-transition";

const route = vi.hoisted(() => ({ pathname: "/warnings" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

afterEach(cleanup);

it("renders its children", () => {
  render(
    <PageTransition>
      <p>Warnings content</p>
    </PageTransition>
  );
  expect(screen.getByText("Warnings content")).toBeInTheDocument();
});
