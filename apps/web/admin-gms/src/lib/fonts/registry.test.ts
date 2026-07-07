import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Drift guard between the font registry and the `data-font` CSS.
 *
 * Both files are parsed as text (importing registry.ts would pull
 * `next/font/google`, which needs the Next.js compiler): every key in
 * `fontRegistry` must have a matching `html[data-font="<key>"]` rule in
 * `globals.css`, and vice versa — a one-sided edit silently breaks the
 * font switcher for the missing key.
 */

const appRoot = path.resolve(import.meta.dirname, "../..");

const REGISTRY_BLOCK_REGEX =
  /export const fontRegistry = \{([\s\S]*?)\} as const/;
const REGISTRY_KEY_REGEX = /^\s*(\w+): \{ label:/gm;
const DATA_FONT_RULE_REGEX = /html\[data-font="(\w+)"\]/g;

function registryKeys(): string[] {
  const source = readFileSync(
    path.join(appRoot, "lib/fonts/registry.ts"),
    "utf8"
  );
  const block = source.match(REGISTRY_BLOCK_REGEX);
  if (!block) throw new Error("fontRegistry block not found in registry.ts");
  return [...block[1].matchAll(REGISTRY_KEY_REGEX)].map((m) => m[1]);
}

function cssKeys(): string[] {
  const css = readFileSync(path.join(appRoot, "app/globals.css"), "utf8");
  return [...css.matchAll(DATA_FONT_RULE_REGEX)].map((m) => m[1]);
}

describe("font registry ↔ globals.css data-font rules", () => {
  it("has a CSS rule for every registry key and no orphaned rules", () => {
    const registry = registryKeys().sort();
    const css = cssKeys().sort();
    expect(registry.length).toBeGreaterThan(0);
    expect(css).toEqual(registry);
  });

  it("keeps the brand default and the print-document font registered", () => {
    const keys = registryKeys();
    expect(keys).toContain("inter"); // UI default
    expect(keys).toContain("notoSans"); // backs --gm-font-document
  });
});
