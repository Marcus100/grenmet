import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

const publicDir = path.resolve(import.meta.dirname, "../../public");

describe("manifest", () => {
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
