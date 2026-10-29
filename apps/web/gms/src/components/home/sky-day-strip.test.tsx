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
const NOW_TAB = /Now/;
const LAST_TAB = /Last reading/;
const RAIN_CHANCE = /Medium chance of rain/;

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
  rainWord: null,
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

  it("shows no words for a day with no forecast, only a dash (screen readers still hear it)", () => {
    renderStrip([day({ high: null, low: null })]);
    const tab = screen.getByRole("link", { name: FRIDAY });
    expect(within(tab).getByText("No forecast yet")).toHaveClass("sr-only");
    // The maximum slot holds a single dash; the minimum slot is blank.
    expect(within(tab).getAllByText("—")).toHaveLength(1);
  });

  it("labels an old reading Last, never Now", () => {
    render(
      <HeroSelectionProvider initial="now">
        <SkyDayStrip
          days={[day({})]}
          now={{
            href: "/",
            label: "Last",
            sky: "cloudy",
            temperature: 26,
            time: "Wed",
          }}
        />
      </HeroSelectionProvider>
    );
    const [tab] = screen.getAllByRole("link");
    expect(tab).toHaveTextContent(LAST_TAB);
    expect(tab).toHaveTextContent("Wed");
    expect(tab).not.toHaveTextContent(NOW_TAB);
  });

  it("leaves out the rain row when no day gives a chance of rain", () => {
    renderStrip([day({}), day({ slug: "2026-10-24", dayName: "Sat" })]);
    const tab = screen.getByRole("link", { name: FRIDAY });
    // Maximum, icon, minimum, day and date: no blank row between.
    expect(tab.children).toHaveLength(5);
    expect(screen.getByRole("link", { name: NOW_TAB }).children).toHaveLength(
      5
    );
  });

  it("reads top to bottom: maximum, sky, rain chance, minimum, then day and date", () => {
    renderStrip([day({ rainWord: "Medium" })]);
    const tab = screen.getByRole("link", { name: FRIDAY });
    expect(tab).toHaveTextContent(RAIN_CHANCE);
    const children = Array.from(tab.children).map(
      (node) => node.textContent ?? ""
    );
    const maximum = children.findIndex((text) => text.includes("maximum"));
    const icon = children.indexOf("");
    const rain = children.findIndex((text) => text.includes("chance of rain"));
    const minimum = children.findIndex((text) => text.includes("minimum"));
    const name = children.indexOf("Fri");
    expect(maximum).toBeGreaterThanOrEqual(0);
    expect([maximum, icon, rain, minimum, name]).toEqual(
      [maximum, icon, rain, minimum, name].toSorted((x, y) => x - y)
    );
  });

  it("leads with a Now tab at every width", () => {
    renderStrip([day({})]);
    const now = screen.getByRole("link", { name: NOW_TAB });
    expect(now.closest("li")?.className ?? "").not.toContain("sm:hidden");
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
