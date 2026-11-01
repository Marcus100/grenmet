import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script with no type declarations
import { extractPage } from "../scripts/extract-page.mjs";

describe("extractPage", () => {
  it("does not turn frontmatter into a section title", () => {
    const page = extractPage(
      [
        "---",
        "title: 'Using the public API'",
        'description: "Check each endpoint."',
        "---",
        "",
        "# Using the public API",
        "",
        "## Choose the correct endpoint",
        "",
      ].join("\n")
    );
    expect(page.pageTitle).toBe("Using the public API");
    expect(page.sections.map((s: { title: string }) => s.title)).toEqual([
      "Choose the correct endpoint",
    ]);
  });

  it("still reads pages without frontmatter", () => {
    const page = extractPage("# Title\n\n## One\n\n## Two\n");
    expect(page.sections.map((s: { id: string }) => s.id)).toEqual([
      "one",
      "two",
    ]);
  });
});
