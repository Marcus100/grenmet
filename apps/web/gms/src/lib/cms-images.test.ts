import { describe, expect, it } from "vitest";
import { isOptimizableImage } from "./cms-images";

describe("isOptimizableImage", () => {
  it("resizes media from the production CMS", () => {
    expect(
      isOptimizableImage("https://cms.barrels.gd/api/media/file/coral-sm.jpg")
    ).toBe(true);
  });

  it("loads staging CMS media directly: basic auth blocks the server-side optimiser", () => {
    expect(
      isOptimizableImage(
        "https://cms.staging.barrels.gd/api/media/file/coral-sm.jpg"
      )
    ).toBe(false);
  });

  it("keeps local files and Unsplash", () => {
    expect(isOptimizableImage("/images/desk/forecast.jpg")).toBe(true);
    expect(isOptimizableImage("https://images.unsplash.com/photo-1")).toBe(
      true
    );
  });

  it("loads anything else directly", () => {
    expect(
      isOptimizableImage("http://localhost:3006/api/media/file/a.jpg")
    ).toBe(false);
    expect(
      isOptimizableImage("https://barrels.gd.example.com/api/media/file/a.jpg")
    ).toBe(false);
    expect(isOptimizableImage("https://cms.barrels.gd/admin/a.jpg")).toBe(
      false
    );
    expect(
      isOptimizableImage("https://weather.barrels.gd/api/media/file/a.jpg")
    ).toBe(false);
  });
});
