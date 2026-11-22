import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest runs from the package directory (jsdom gives no file URL for import.meta).
const css = readFileSync(resolve(process.cwd(), "src/app/booking.css"), "utf8");

const ACCENT_BACKGROUND =
  /background:\s*var\(--booking-accent,\s*var\(--primary\)\)/u;
const OPACITY_CUE = /opacity:\s*0\.9/u;
const NAVY_BACKGROUND = /background:\s*var\(--primary\)/u;
const RULE_BODY = /\{([^}]*)\}/u;

/** The declaration block of the first rule whose selector is `selector`. */
function blockFor(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`rule not found: ${selector}`);
  }
  return RULE_BODY.exec(css.slice(start))?.[1] ?? "";
}

describe("booking.css brand accent", () => {
  it.each([
    ".btn-solid",
    ".btn-solid:hover:not(:disabled)",
    ".btn-solid:active:not(:disabled)",
  ])(
    "%s paints the accent, not the navy token, on a branded button",
    (selector) => {
      const block = blockFor(selector);
      expect(block).toMatch(ACCENT_BACKGROUND);
      expect(block).not.toMatch(NAVY_BACKGROUND);
    }
  );

  it("keeps the hover cue as an opacity change, not a colour flip", () => {
    expect(blockFor(".btn-solid:hover:not(:disabled)")).toMatch(OPACITY_CUE);
  });
});
