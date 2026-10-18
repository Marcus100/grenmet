import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  NOT_YET_AVAILABLE,
  PlaceholderNotice,
} from "@/components/pages/placeholder-notice";

afterEach(cleanup);

const SAMPLE_WORD = /sample/i;
const ILLUSTRATIVE = /illustrative/i;
const PAGES_DIR = join(import.meta.dirname, "../../app/(pages)");

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return pageFiles(full);
    return name === "page.tsx" ? [full] : [];
  });
}

describe("PlaceholderNotice", () => {
  it.each([false, true])(
    "is an honest notice, never sample (compact=%s)",
    (compact) => {
      render(
        <PlaceholderNotice compact={compact} product="Tide predictions" />
      );
      const note = screen.getByRole("note");
      expect(note).toHaveTextContent(NOT_YET_AVAILABLE);
      expect(note).toHaveTextContent("Tide predictions will appear here");
      expect(note.textContent ?? "").not.toMatch(SAMPLE_WORD);
      expect(note.textContent ?? "").not.toMatch(ILLUSTRATIVE);
    }
  );

  it("links to a live source when given one", () => {
    render(
      <PlaceholderNotice
        product="The 7-day outlook"
        source={{ href: "/weather", label: "the daily forecast" }}
      />
    );
    expect(
      screen.getByRole("link", { name: "the daily forecast" })
    ).toHaveAttribute("href", "/weather");
  });
});

describe("standing pages", () => {
  it("never print sample figures or dates", () => {
    const offenders = pageFiles(PAGES_DIR).filter((file) =>
      readFileSync(file, "utf8").includes('"Sample ')
    );
    expect(offenders).toEqual([]);
  });
});
