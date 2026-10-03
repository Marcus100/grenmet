import { describe, expect, it } from "vitest";
import { currentGroup, isCurrent, isGroup, NAV } from "@/lib/nav";

describe("nav", () => {
  it("organises the site around learning, evidence and local context", () => {
    expect(NAV.map((item) => item.label)).toEqual([
      "Election 2026",
      "Learn",
      "Results & history",
      "Your constituency",
      "People & parties",
    ]);
    expect(NAV[0]).toEqual({ href: "/2026", label: "Election 2026" });
  });

  it("marks a section current on its sub-pages, never the front page", () => {
    expect(isCurrent("/", "/constituencies")).toBe(false);
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/constituencies", "/constituencies/st-mark")).toBe(true);
  });

  it("knows the learning and constituency groups", () => {
    expect(currentGroup("/trends")).toBe("Learn");
    expect(currentGroup("/constituencies")).toBe("Your constituency");
  });

  it("has no duplicate links", () => {
    const hrefs = NAV.flatMap((item) =>
      isGroup(item) ? item.links.map((l) => l.href) : [item.href]
    );
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
