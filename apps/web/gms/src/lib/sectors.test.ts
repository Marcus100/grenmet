import {
  formatSectors,
  isSectorKey,
  parseSectors,
  SECTORS,
  sectorLabel,
} from "@barrelsgd/gms/sectors";
import { describe, expect, it } from "vitest";

describe("sectors", () => {
  it("lists the six sectors in menu order", () => {
    expect(SECTORS.map((sector) => sector.value)).toEqual([
      "tourism",
      "marine",
      "aviation",
      "agriculture",
      "health",
      "roads-transport",
    ]);
  });
  it("reads a stored list: trims, keeps menu order, drops unknown and repeated names", () => {
    expect(parseSectors(" health , marine,marine, nonsense")).toEqual([
      "marine",
      "health",
    ]);
    expect(parseSectors("")).toEqual([]);
    expect(parseSectors(null)).toEqual([]);
    expect(parseSectors(undefined)).toEqual([]);
  });
  it("writes the stored form in menu order", () => {
    expect(formatSectors(["health", "tourism"])).toBe("tourism,health");
    expect(formatSectors([])).toBe("");
  });
  it("recognises keys and labels them", () => {
    expect(isSectorKey("aviation")).toBe(true);
    expect(isSectorKey("Aviation")).toBe(false);
    expect(sectorLabel("roads-transport")).toBe("Roads & transport");
  });
});
