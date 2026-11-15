import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Reads the real colour tokens from app.css, so the test cannot drift from
// the values the screens paint.
const css = readFileSync(path.resolve(import.meta.dirname, "app.css"), "utf8");

function token(name: string): string {
  const match = new RegExp(
    `--color-px-${name}:\\s*(#[0-9a-fA-F]{6})`,
    "u"
  ).exec(css);
  if (!match?.[1]) {
    throw new Error(`token --color-px-${name} not found in app.css`);
  }
  return match[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.039_28
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** WCAG contrast ratio between two hex colours. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

describe("printix palette contrast (WCAG)", () => {
  it("paper text on the refusal red reaches 5:1, so normal text passes AA", () => {
    expect(contrast(token("paper"), token("stop"))).toBeGreaterThanOrEqual(5);
  });

  it("ink text on the admitted green passes AA for normal text", () => {
    expect(contrast(token("ink"), token("valid"))).toBeGreaterThanOrEqual(4.5);
  });

  it("paper text on the ink background passes AA for normal text", () => {
    expect(contrast(token("paper"), token("ink"))).toBeGreaterThanOrEqual(4.5);
  });
});
