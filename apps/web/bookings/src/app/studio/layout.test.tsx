import { describe, expect, it } from "vitest";
import StudioLayout, { metadata, viewport } from "./layout";

describe("studio layout", () => {
  it("passes the page through: each area draws its own frame", () => {
    const page = <p>Page</p>;
    expect(StudioLayout({ children: page })).toBe(page);
  });

  it("is never indexed and links the install manifest and theme colour", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.manifest).toBe("/studio-manifest.webmanifest");
    expect(viewport.themeColor).toBe("#15006b");
  });
});
