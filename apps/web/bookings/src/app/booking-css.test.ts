import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest runs from the package directory (jsdom gives no file URL for import.meta).
const css = readFileSync(resolve(process.cwd(), "src/app/booking.css"), "utf8");

const ACCENT_BACKGROUND =
  /background:\s*var\(--booking-accent,\s*var\(--primary\)\)/u;
const OPACITY_CUE = /opacity:\s*0\.9/u;
const NAVY_BACKGROUND = /background:\s*var\(--primary\)/u;
const DISPLAY_CONTENTS = /display:\s*contents/u;
const DISPLAY_NONE = /display:\s*none/u;
const ONE_ROW_COLUMNS = /grid-template-columns:\s*auto minmax\(0, 1fr\) auto/u;
const SPAN_ORDER = /\.slots-nav > span \{[^}]*order:/u;
const ZERO_MIN_HEIGHT = /min-height:\s*0/u;
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

describe("booking.css phone steps", () => {
  it("shows every pane (display: contents) outside the phone layout", () => {
    expect(blockFor(".book-pane")).toMatch(DISPLAY_CONTENTS);
  });

  it("hides inactive panes with display: none, only below md and only once enhanced", () => {
    const rule =
      '@media (max-width: 767px) {\n  .book-form[data-steps="on"] .book-pane {';
    expect(css).toContain(rule);
    expect(
      blockFor('.book-form[data-steps="on"] .book-pane[data-active="false"]')
    ).toMatch(DISPLAY_NONE);
  });

  it("keeps the phone-only controls off laptops", () => {
    expect(blockFor(".book-phone-only")).toMatch(DISPLAY_NONE);
  });
});

const count = (text: string, part: string) => text.split(part).length - 1;

describe("booking.css motion", () => {
  it("defines the two curves once, as tokens, and bans the usual mistakes", () => {
    expect(count(css, "--ease-out:")).toBe(1);
    expect(count(css, "--ease-in-out:")).toBe(1);
    expect(css).not.toContain("transition: all");
    expect(css).not.toContain("scale(0)");
    expect(css.replaceAll("ease-in-out", "")).not.toContain("ease-in");
  });

  it("slides the new step in from the side it is moving toward, 24 px over 220 ms", () => {
    expect(css).toContain(
      '.book-form[data-direction="forward"] .book-pane[data-active="true"]'
    );
    expect(css).toContain(
      '.book-form[data-direction="back"] .book-pane[data-active="true"]'
    );
    expect(css).toContain("book-step-in-forward 220ms var(--ease-out) both");
    expect(css).toContain("book-step-in-back 220ms var(--ease-out) both");
    expect(css).toContain("translateX(24px)");
    expect(css).toContain("translateX(-24px)");
  });

  it("fills the progress bars with scaleX, not width", () => {
    expect(css).toContain("transform-origin: left");
    expect(css).toContain("transform 250ms var(--ease-in-out)");
  });

  it("gives press feedback and draws the confirmation tick", () => {
    expect(css).toContain("--press-scale: 0.97");
    expect(css).toContain("scale(var(--press-scale))");
    expect(css).toContain("transform 140ms var(--ease-out)");
    expect(css).toContain("book-reveal 400ms var(--ease-out) both");
    expect(css).toContain("clip-path: inset(0 100% 0 0)");
    expect(css).toContain("book-rise-in 350ms var(--ease-out) both");
    expect(css).not.toContain("stroke-dashoffset");
  });

  it("falls back to a plain fade under reduced motion", () => {
    const start = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(start).toBeGreaterThan(-1);
    const reduced = css.slice(start);
    expect(reduced).toContain("book-fade-in 150ms linear both");
    expect(reduced).toContain(".book-dot::after {\n    transition: none;");
    expect(reduced).toContain("--press-scale: 1");
    expect(reduced).not.toContain("translateX");
  });
});

describe("booking.css Turnstile on phones", () => {
  it("hides the widget without display: none so it stays solvable", () => {
    const block = blockFor(
      '.book-form[data-steps="on"] .book-turnstile[data-hidden="true"]'
    );
    expect(block).toContain("width: min(300px, 100%)");
    expect(block).toContain("visibility: hidden");
    expect(block).toContain("position: absolute");
    expect(block).toContain("pointer-events: none");
    expect(block).not.toContain("display");
  });

  it("keeps original colour transition timings and gives transform its own", () => {
    expect(css).toContain("background-color 120ms ease-out");
    expect(css).not.toContain("background-color 150ms");
  });
});

describe("booking.css chips", () => {
  it("scales the label on press, never the span over the radio input", () => {
    expect(blockFor(".chip:active")).toContain("scale(var(--press-scale))");
    expect(blockFor(".chip span")).not.toContain("transform");
    expect(blockFor(".chip:active span")).not.toContain("transform");
  });
});

describe("booking.css Turnstile margin", () => {
  it("pulls the widget up only while it is empty", () => {
    expect(blockFor(".book-turnstile:has(> div:empty)")).toContain(
      "margin-top: -1.5rem"
    );
    expect(css).not.toContain(".book-turnstile {\n  margin-top");
  });
});

describe("booking.css date paging row", () => {
  it("puts Earlier, the range and Later on one grid row at phone width", () => {
    const start = css.indexOf("  .slots-nav {");
    expect(start).toBeGreaterThan(-1);
    const block = RULE_BODY.exec(css.slice(start))?.[1] ?? "";
    expect(block).toMatch(ONE_ROW_COLUMNS);
    expect(css).not.toMatch(SPAN_ORDER);
  });

  it("drops the empty status row instead of leaving a gap above Day", () => {
    expect(blockFor(".slots-status:empty")).toMatch(ZERO_MIN_HEIGHT);
  });
});
