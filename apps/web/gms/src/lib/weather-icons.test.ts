import { Cloud, CloudRain, CloudSun, Sun } from "lucide-react";
import { describe, expect, it } from "vitest";
import {
  WEATHER_CONDITION_LABEL,
  type WeatherCondition,
  weatherIcon,
} from "@/lib/weather-icons";

describe("weatherIcon", () => {
  it("maps each condition to its icon", () => {
    expect(weatherIcon("sunny")).toBe(Sun);
    expect(weatherIcon("partly-cloudy")).toBe(CloudSun);
    expect(weatherIcon("cloudy")).toBe(Cloud);
    expect(weatherIcon("showers")).toBe(CloudRain);
  });
});

describe("WEATHER_CONDITION_LABEL", () => {
  it("has a non-empty label for every condition", () => {
    const conditions: WeatherCondition[] = [
      "cloudy",
      "partly-cloudy",
      "showers",
      "sunny",
    ];
    for (const condition of conditions) {
      expect(WEATHER_CONDITION_LABEL[condition]).toBeTruthy();
    }
  });
});
