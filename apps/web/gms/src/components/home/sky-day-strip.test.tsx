import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroSelectionProvider } from "@/components/home/hero-selection";
import {
  iconY,
  lineSegments,
  SkyDayStrip,
  type StripDay,
} from "@/components/home/sky-day-strip";

const FRIDAY = /Fri/;
const NOW_TAB = /^Now/;
const RAIN_CHANCE = /chance of rain|Low|High/;

const day = (overrides: Partial<StripDay>): StripDay => ({
  condition: "sunny",
  date: 23,
  dayName: "Fri",
  high: 31,
  href: "/weather/2026/10/23",
  isToday: false,
  low: 25,
  month: "Oct",
  path: "/weather/2026/10/23",
  slug: "2026-10-23",
  ...overrides,
});

function renderStrip(days: StripDay[]) {
  render(
    <HeroSelectionProvider initial="now">
      <SkyDayStrip
        days={days}
        now={{ href: "/", sky: "sunny", temperature: 29, time: "13:00" }}
      />
    </HeroSelectionProvider>
  );
}

describe("SkyDayStrip", () => {
  it("shows the maximum and minimum for a day with a forecast", () => {
    renderStrip([day({})]);
    const tab = screen.getByRole("link", { name: FRIDAY });
    expect(within(tab).getByText("31°")).toBeInTheDocument();
    expect(within(tab).getByText("25°")).toBeInTheDocument();
    expect(within(tab).queryByText("No forecast yet")).not.toBeInTheDocument();
  });

  it("says one short line for a day with no forecast, not two dashes", () => {
    renderStrip([day({ high: null, low: null })]);
    const tab = screen.getByRole("link", { name: FRIDAY });
    expect(within(tab).getByText("No forecast yet")).toBeInTheDocument();
    // The maximum slot holds a single dash; the minimum slot holds the words.
    expect(within(tab).getAllByText("—")).toHaveLength(1);
  });

  it("stacks day, date, maximum, sky, then minimum, with no rain chance", () => {
    renderStrip([day({})]);
    const tab = screen.getByRole("link", { name: FRIDAY });
    const order = ["Fri", "31°", "25°"].map((text) =>
      (tab.textContent ?? "").indexOf(text)
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect(within(tab).queryByText(RAIN_CHANCE)).not.toBeInTheDocument();
    // The maximum sits above the icon row and the minimum below it.
    const children = Array.from(tab.children).map((node) => node.textContent);
    expect(children.indexOf("31° maximum")).toBeLessThan(children.indexOf(""));
    expect(children.indexOf("")).toBeLessThan(children.indexOf("25° minimum"));
  });

  it("marks the selected tab with a lighter column, not an underline", () => {
    renderStrip([day({})]);
    const now = screen.getByRole("link", { name: NOW_TAB });
    expect(now).toHaveAttribute("aria-current", "page");
    expect(now.className).toContain("bg-gm-text-inverse/20");
    expect(now.className).not.toContain("border-b-4");
    expect(screen.getByRole("link", { name: FRIDAY })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("keeps a missing day's tab in place so the strip stays aligned", () => {
    renderStrip([day({}), day({ slug: "2026-10-24", high: null, low: null })]);
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});

describe("iconY", () => {
  it("lifts the warmest tab and lowers the coolest, and has nothing for no figure", () => {
    const warm = iconY(32, 24, 32);
    const mid = iconY(28, 24, 32);
    const cool = iconY(24, 24, 32);
    expect(warm).not.toBeNull();
    expect((warm as number) < (mid as number)).toBe(true);
    expect((mid as number) < (cool as number)).toBe(true);
    expect(iconY(null, 24, 32)).toBeNull();
  });
  it("keeps every icon level when all the figures are equal", () => {
    expect(iconY(30, 30, 30)).toBe(iconY(31, 31, 31));
  });
});

describe("lineSegments", () => {
  it("joins to each neighbour's midpoint and leaves out a side with no figure", () => {
    expect(lineSegments(30, 40, 20)).toEqual({
      left: "M 0 35 L 50 30",
      right: "M 50 30 L 100 25",
    });
    expect(lineSegments(30, null, 20).left).toBe("");
    expect(lineSegments(30, 40, null).right).toBe("");
    expect(lineSegments(null, 40, 20)).toEqual({ left: "", right: "" });
  });
});
