import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

import { WeatherDateNav } from "@/components/weather-date-nav";
import { getForecastDays } from "@/lib/forecast-days";

describe("WeatherDateNav", () => {
  it("shows the high and low for every day in the strip", () => {
    render(<WeatherDateNav />);
    const links = screen.getAllByRole("link");
    const days = getForecastDays();
    days.forEach((day, i) => {
      const text = links[i]?.textContent ?? "";
      expect(text).toContain(`${day.high}°`);
      expect(text).toContain(`${day.low}°`);
    });
  });

  it("links today's chip to the home route and the rest to their date slug", () => {
    render(<WeatherDateNav />);
    const days = getForecastDays();
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/");
    expect(links[1]).toHaveAttribute("href", `/${days[1]?.slug}`);
  });
});
