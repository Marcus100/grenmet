import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ByTab,
  HeroSelectionProvider,
  TabLink,
} from "@/components/home/hero-selection";

afterEach(cleanup);

const PANELS = {
  now: <p>Now reading</p>,
  "2026-10-28": <p>Wednesday forecast</p>,
  "2026-10-29": <p>Thursday forecast</p>,
};

/** The wrapper each panel sits in: the element whose child is the panel text. */
function wrapperOf(text: string): HTMLElement {
  const element = screen.getByText(text).parentElement;
  if (!element) throw new Error(`no wrapper for ${text}`);
  return element;
}

function renderTabs(initial: string) {
  return render(
    <HeroSelectionProvider initial={initial}>
      <nav>
        <TabLink
          className="tab"
          currentClassName="is-current"
          data-analytics-day="now"
          href="/"
          idleClassName=""
          slug="now"
        >
          Now tab
        </TabLink>
        <TabLink
          className="tab"
          currentClassName="is-current"
          href="/2026-10-28"
          idleClassName=""
          slug="2026-10-28"
        >
          Wednesday tab
        </TabLink>
      </nav>
      <ByTab panels={PANELS} />
    </HeroSelectionProvider>
  );
}

describe("ByTab stacked panels", () => {
  it("renders every panel in one grid cell so the container is as tall as the tallest", () => {
    const { container } = renderTabs("now");
    const stack = container.querySelector(".grid.min-w-0");
    expect(stack).not.toBeNull();
    const cells = Array.from(stack?.children ?? []);
    expect(cells).toHaveLength(3);
    for (const cell of cells) {
      expect(cell).toHaveClass("col-start-1", "row-start-1");
    }
  });

  it("shows only the selected panel and hides the others from assistive tech", () => {
    renderTabs("now");
    expect(wrapperOf("Now reading")).toHaveClass("visible");
    expect(wrapperOf("Now reading")).not.toHaveAttribute("aria-hidden");
    for (const text of ["Wednesday forecast", "Thursday forecast"]) {
      expect(wrapperOf(text)).toHaveClass("invisible");
      expect(wrapperOf(text)).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("switches panels on a plain click without a navigation", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    renderTabs("now");
    fireEvent.click(screen.getByRole("link", { name: "Wednesday tab" }));
    expect(wrapperOf("Wednesday forecast")).toHaveClass("visible");
    expect(wrapperOf("Now reading")).toHaveClass("invisible");
    expect(replace).toHaveBeenCalledWith(null, "", "/2026-10-28");
    replace.mockRestore();
  });

  it("falls back to Now when the selected tab has no panel", () => {
    renderTabs("2026-11-01");
    expect(wrapperOf("Now reading")).toHaveClass("visible");
    expect(wrapperOf("Wednesday forecast")).toHaveClass("invisible");
  });
});
