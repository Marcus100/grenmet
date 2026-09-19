import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PageTransition } from "./page-transition";

const route = vi.hoisted(() => ({ pathname: "/hr" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

afterEach(cleanup);

it("renders its children", () => {
  render(
    <PageTransition>
      <p>HR dashboard</p>
    </PageTransition>
  );
  expect(screen.getByText("HR dashboard")).toBeInTheDocument();
});
