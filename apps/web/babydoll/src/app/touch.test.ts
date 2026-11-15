import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  path.resolve(import.meta.dirname, "globals.css"),
  "utf8"
).replace(/\/\*[\s\S]*?\*\//gu, "");

const MOUSE_ONLY = "(hover: hover) and (pointer: fine)";
const BTN_ACTIVE = /\.btn:active \{/u;
const BOOK_LINK_ACTIVE = /\.book-link:active,/u;
const HIT_AREA = /height: 44px;\s*content: "";/u;

// Returns each selector containing :hover that is not inside a block that
// only applies to mouse pointers. A small brace walker: enough for this file.
function hoverRulesOutsideMouseMedia(source: string): string[] {
  const open: string[] = [];
  const offenders: string[] = [];
  let prelude = "";
  for (const char of source) {
    if (char === "{") {
      const selector = prelude.trim();
      if (
        selector.includes(":hover") &&
        !open.some((block) => block.includes(MOUSE_ONLY))
      ) {
        offenders.push(selector);
      }
      open.push(selector);
      prelude = "";
    } else if (char === "}") {
      open.pop();
      prelude = "";
    } else if (char === ";") {
      prelude = "";
    } else {
      prelude += char;
    }
  }
  return offenders;
}

describe("babydoll touch behaviour", () => {
  it("imports the shared app-feel layer (tap flash, touch action, reduced motion)", () => {
    expect(css).toContain('@import "@barrelsgd/ui/styles/app-feel";');
    expect(css.indexOf("@import")).toBeLessThan(css.indexOf(":root"));
  });

  it("applies every hover style only to mouse pointers", () => {
    expect(hoverRulesOutsideMouseMedia(css)).toEqual([]);
  });

  it("finds hover rules in the walker (guards against a silent pass)", () => {
    expect(hoverRulesOutsideMouseMedia(".btn:hover { color: red; }")).toEqual([
      ".btn:hover",
    ]);
    expect(
      hoverRulesOutsideMouseMedia(
        `@media ${MOUSE_ONLY} { .btn:hover { color: red; } }`
      )
    ).toEqual([]);
  });

  it("gives the Book buttons a pressed state that needs no hover", () => {
    expect(css).toMatch(BTN_ACTIVE);
    expect(css).toMatch(BOOK_LINK_ACTIVE);
  });

  it("gives small controls a 44 px hit area without changing their box", () => {
    for (const selector of [
      ".book-link::before",
      ".chips button::before",
      ".type-filter button::before",
      ".book-bar .btn::before",
      ".footer-links a::before",
      ".legal a::before",
    ]) {
      expect(css).toContain(selector);
    }
    expect(css).toMatch(HIT_AREA);
  });
});
