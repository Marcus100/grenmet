import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PageTransition } from "./page-transition";

const route = vi.hoisted(() => ({ pathname: "/alerts" }));
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

it("has no inline opacity, so server HTML is visible without JavaScript", () => {
  const { container } = render(
    <PageTransition>
      <p>Warnings content</p>
    </PageTransition>
  );
  const wrapper = container.firstElementChild as HTMLElement;
  expect(wrapper.getAttribute("style")).toBeNull();
  expect(wrapper).toHaveClass("fade-in-0");
});

it("remounts the wrapper when the pathname changes", () => {
  route.pathname = "/alerts";
  const { container, rerender } = render(
    <PageTransition>
      <p>Page</p>
    </PageTransition>
  );
  const first = container.firstElementChild;
  route.pathname = "/marine";
  rerender(
    <PageTransition>
      <p>Page</p>
    </PageTransition>
  );
  expect(container.firstElementChild).not.toBe(first);
});

it("shows the new page at once on a pathname change, with no exit phase", () => {
  route.pathname = "/alerts";
  const { rerender } = render(
    <PageTransition>
      <p>Old page</p>
    </PageTransition>
  );
  route.pathname = "/marine";
  rerender(
    <PageTransition>
      <p>New page</p>
    </PageTransition>
  );
  expect(screen.getByText("New page")).toBeInTheDocument();
  expect(screen.queryByText("Old page")).not.toBeInTheDocument();
});
