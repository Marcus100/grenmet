import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface ManifestIcon {
  readonly purpose?: string;
  readonly sizes: string;
  readonly src: string;
}

/** The page links the manifest, whatever order its attributes are in. */
const MANIFEST_LINK =
  /<link (?=[^>]*rel="manifest")(?=[^>]*href="\/manifest\.webmanifest")[^>]*>/u;

const publicDir = path.resolve(import.meta.dirname, "../public");
const manifest = (): {
  display: string;
  icons?: ManifestIcon[];
  start_url: string;
} =>
  JSON.parse(
    readFileSync(path.join(publicDir, "manifest.webmanifest"), "utf8")
  );

describe("manifest", () => {
  it("is linked from the page", () => {
    const page = readFileSync(path.resolve(publicDir, "../index.html"), "utf8");
    expect(page).toMatch(MANIFEST_LINK);
  });

  const data = manifest();

  it("opens full screen from the home screen", () => {
    expect(data.display).toBe("standalone");
    expect(data.start_url).toBe("/");
  });

  it("has the icon sizes phones need to offer installation", () => {
    const sizes = data.icons?.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(data.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  it("points only at icon files that exist", () => {
    for (const icon of data.icons ?? []) {
      expect(existsSync(path.join(publicDir, icon.src)), icon.src).toBe(true);
    }
  });
});
