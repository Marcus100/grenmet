import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(path.resolve(import.meta.dirname, "app", file), "utf8");

// The client wants one colour scheme (light). The site must not follow the
// visitor's system dark setting.
describe("light theme only", () => {
  it("has no dark palette and declares a light colour scheme", () => {
    const css = read("globals.css");
    expect(css).not.toContain("prefers-color-scheme");
    expect(css).toContain("color-scheme: light;");
  });

  it("sets one theme colour for the browser chrome", () => {
    const layout = read("layout.tsx");
    expect(layout).not.toContain("prefers-color-scheme");
    expect(layout).toContain('themeColor: "#f8f4ef"');
  });
});
