import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroSelectionProvider } from "@/components/home/hero-selection";
import { SkyDayStrip, type StripDay } from "@/components/home/sky-day-strip";

const FRIDAY = /Fri/;

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
  rain: 20,
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
    renderStrip([day({ high: null, low: null, rain: null })]);
    const tab = screen.getByRole("link", { name: FRIDAY });
    expect(within(tab).getByText("No forecast yet")).toBeInTheDocument();
    expect(within(tab).queryByText("—")).not.toBeInTheDocument();
  });

  it("keeps a missing day's tab in place so the strip stays aligned", () => {
    renderStrip([
      day({}),
      day({ slug: "2026-10-24", high: null, low: null, rain: null }),
    ]);
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});
