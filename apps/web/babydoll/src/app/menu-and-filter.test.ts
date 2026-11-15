import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  path.resolve(import.meta.dirname, "globals.css"),
  "utf8"
).replace(/\/\*[\s\S]*?\*\//gu, "");

const HIDDEN_PANEL = /\.menu-cols\[hidden\] \{\s*display: none;\s*\}/u;
const FILTER_RULE = /\.type-filter button \{[^}]*color: var\(--ink-soft\);/u;
const TOKEN = (name: string) =>
  new RegExp(`--${name}: (#[0-9a-f]{6});`, "u").exec(css)?.[1] ?? "";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => {
    const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [red = 0, green = 0, blue = 0] = channels;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

describe("service tabs", () => {
  it("hides the inactive price panels even though the grid is set", () => {
    expect(css).toMatch(HIDDEN_PANEL);
  });
});

describe("portfolio filter", () => {
  it("uses the soft ink for the options that are not selected", () => {
    expect(css).toMatch(FILTER_RULE);
  });

  it("keeps every option at 4.5 to 1 or better on the cream page", () => {
    const soft = contrast(TOKEN("ink-soft"), TOKEN("paper"));
    expect(soft).toBeGreaterThanOrEqual(4.5);
  });
});
