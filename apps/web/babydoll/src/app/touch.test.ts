import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The stylesheet with comments removed, so the walker below sees only rules.
const css = readFileSync(
  path.resolve(import.meta.dirname, "globals.css"),
  "utf8"
).replace(/\/\*[\s\S]*?\*\//gu, "");

const TOUCH_ACTION = /a,\s*button \{\s*touch-action: manipulation;/u;
const BAR_SCROLL = /scroll-padding-bottom: var\(--bar-h\);/u;
const FILTER_ZONE = /\.type-filter button::before \{([^}]*)\}/u;
const BAR_HEIGHT =
  /--bar-h: calc\(76px \+ env\(safe-area-inset-bottom, 0px\)\);/u;
const NEGATIVE_OFFSET = /(top|bottom|inset):\s*-/u;

const MOUSE_ONLY = "(hover: hover) and (pointer: fine)";

// Returns each selector containing :hover that is not inside a block that only
// applies to mouse pointers. A small brace walker: enough for this file.
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

describe("babydoll hover styles", () => {
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
});

describe("babydoll touch and keyboard layer", () => {
  it("keeps taps instant on links and buttons", () => {
    expect(css).toMatch(TOUCH_ACTION);
  });

  it("keeps focused controls clear of the fixed Book bar", () => {
    expect(css).toMatch(BAR_SCROLL);
  });

  it("keeps the portfolio filter zone inside its own row", () => {
    const zone = FILTER_ZONE.exec(css)?.[1] ?? "";
    expect(zone).toContain("inset: 0;");
    expect(zone).not.toMatch(NEGATIVE_OFFSET);
  });

  it("counts the phone's bottom safe area in the Book bar height", () => {
    expect(css).toMatch(BAR_HEIGHT);
  });
});
