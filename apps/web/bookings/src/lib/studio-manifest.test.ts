import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/studio-manifest.webmanifest/route";
import { studioManifest } from "./studio-manifest";

const publicDir = path.resolve(import.meta.dirname, "../../public");

describe("studio manifest", () => {
  const manifest = studioManifest();

  it("names the app and opens it full screen at /studio", () => {
    expect(manifest.name).toBe("Barrels Bookings Studio");
    expect(manifest.short_name).toBe("Studio");
    expect(manifest.start_url).toBe("/studio");
    expect(manifest.scope).toBe("/studio");
    expect(manifest.display).toBe("standalone");
  });

  it("uses the lane colours", () => {
    expect(manifest.theme_color).toBe("#15006b");
    expect(manifest.background_color).toBe("#f4f5f8");
  });

  it("has the icon sizes phones need, all present on disk", () => {
    const icons = manifest.icons ?? [];
    expect(icons.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"])
    );
    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of icons) {
      expect(existsSync(path.join(publicDir, icon.src)), icon.src).toBe(true);
    }
  });

  it("is served as a manifest without a session", async () => {
    const response = GET();
    expect(response.headers.get("content-type")).toBe(
      "application/manifest+json"
    );
    expect(await response.json()).toMatchObject({ start_url: "/studio" });
  });
});
