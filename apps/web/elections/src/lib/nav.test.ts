import { describe, expect, it } from "vitest";
import { currentGroup, isCurrent, isGroup, NAV } from "@/lib/nav";

describe("nav", () => {
  it("uses task words, with the election first and the rest under More", () => {
    expect(NAV.map((item) => item.label)).toEqual([
      "Election 2026",
      "Candidates",
      "Forecast",
      "Make your map",
      "Results",
      "Constituencies",
      "More",
    ]);
    expect(NAV[0]).toEqual({ href: "/2026", label: "Election 2026" });
  });

  it("marks a section current on its sub-pages, never the front page", () => {
    expect(isCurrent("/", "/constituencies")).toBe(false);
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/constituencies", "/constituencies/st-mark")).toBe(true);
  });

  it("knows which pages sit under More", () => {
    expect(currentGroup("/trends")).toBe("More");
    expect(currentGroup("/constituencies")).toBeUndefined();
  });

  it("has no duplicate links", () => {
    const hrefs = NAV.flatMap((item) =>
      isGroup(item) ? item.links.map((l) => l.href) : [item.href]
    );
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
