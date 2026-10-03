import { describe, expect, it } from "vitest";
import { type SiteSearchEntry, searchSite } from "@/data/site-search";

const index: SiteSearchEntry[] = [
  {
    href: "/learn/a",
    title: "Reading results",
    kind: "Guide",
    summary: "Turnout and seats",
    keywords: ["participation"],
  },
  {
    href: "/learn/b",
    title: "Turnout",
    kind: "Guide",
    summary: "Understanding the count",
    keywords: [],
  },
  {
    href: "/candidates/a",
    title: "Example Person",
    kind: "Person",
    summary: "Historical identity provisional",
    keywords: ["NDC"],
  },
];
describe("site search", () => {
  it("ranks an exact title ahead of a summary match", () => {
    expect(searchSite(index, "turnout").map((row) => row.href)).toEqual([
      "/learn/b",
      "/learn/a",
    ]);
  });
  it("matches keywords and all query words without mutating the index", () => {
    expect(searchSite(index, "participation")[0]?.href).toBe("/learn/a");
    expect(searchSite(index, "example NDC")[0]?.kind).toBe("Person");
    expect(searchSite(index, "unknown")).toEqual([]);
    expect(index[0]?.title).toBe("Reading results");
  });
  it("rejects empty or one-character queries and respects result limits", () => {
    expect(searchSite(index, " ")).toEqual([]);
    expect(searchSite(index, "a")).toEqual([]);
    expect(searchSite(index, "turnout", 1)).toHaveLength(1);
  });
});
