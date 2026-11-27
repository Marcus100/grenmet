import { describe, expect, it } from "vitest";
import {
  GALLERY_MAX_BYTES,
  GALLERY_MAX_PHOTOS,
  galleryPhotoProblem,
  moved,
} from "@/lib/gallery-photo";

describe("galleryPhotoProblem", () => {
  it("accepts a JPEG, PNG or WebP within the size limit", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(galleryPhotoProblem({ size: 1024, type })).toBeNull();
    }
  });

  it("refuses another type", () => {
    expect(galleryPhotoProblem({ size: 1024, type: "image/svg+xml" })).toBe(
      "Choose a JPEG, PNG or WebP image."
    );
  });

  it("refuses a file over five megabytes", () => {
    expect(
      galleryPhotoProblem({
        size: GALLERY_MAX_BYTES + 1,
        type: "image/jpeg",
      })
    ).toContain("larger than 5 MB");
  });

  it("shows the same count the API enforces", () => {
    expect(GALLERY_MAX_PHOTOS).toBe(12);
  });
});

describe("moved", () => {
  it("moves one photograph earlier", () => {
    expect(moved(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
  });

  it("moves one photograph later", () => {
    expect(moved(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("leaves the ends alone and never loses a photograph", () => {
    expect(moved(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moved(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    expect(moved(["a", "b"], 5, 1)).toEqual(["a", "b"]);
  });
});
