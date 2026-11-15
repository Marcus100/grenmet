import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The stylesheet with comments removed, so the walker below sees only rules.
const css = readFileSync(
  path.resolve(import.meta.dirname, "globals.css"),
  "utf8"
).replace(/\/\*[\s\S]*?\*\//gu, "");

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
