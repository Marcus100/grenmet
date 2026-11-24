import { describe, expect, it } from "vitest";
import { type DocPage, searchPages } from "@/lib/page-search";

const PAGES: DocPage[] = [
  {
    description: "What to do before a storm reaches the airport",
    path: "/hurricane-plan",
    title: "Hurricane plan",
  },
  {
    description: "Vehicles that cross the airside",
    path: "/appendix/mbia-vehicles",
    title: "Vehicles at MBIA",
  },
  {
    description: "How rainfall is recorded and checked",
    path: "/rainfall",
    title: "Rainfall records",
  },
];

describe("searchPages", () => {
  it("returns nothing for an empty query", () => {
    expect(searchPages(PAGES, "   ")).toEqual([]);
  });

  it("matches words as prefixes of the title or description", () => {
    expect(searchPages(PAGES, "hurr").map((p) => p.path)).toEqual([
      "/hurricane-plan",
    ]);
    expect(searchPages(PAGES, "airside").map((p) => p.path)).toEqual([
      "/appendix/mbia-vehicles",
    ]);
  });

  it("needs every word of the query to match", () => {
    expect(searchPages(PAGES, "storm rainfall")).toEqual([]);
    expect(searchPages(PAGES, "storm airport").map((p) => p.path)).toEqual([
      "/hurricane-plan",
    ]);
  });

  it("finds a page by its title word", () => {
    const ranked = searchPages(PAGES, "vehicles").map((p) => p.path);
    expect(ranked).toEqual(["/appendix/mbia-vehicles"]);
  });

  it("caps the number of results", () => {
    expect(searchPages(PAGES, "a", 1)).toHaveLength(1);
  });
});
