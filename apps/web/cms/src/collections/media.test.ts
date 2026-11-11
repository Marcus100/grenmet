import { describe, expect, it } from "vitest";
import { MEDIA_CACHE_CONTROL, Media, mediaResponseHeaders } from "./media";

describe("Media", () => {
  it("lets browsers keep public media files instead of downloading them every visit", () => {
    const headers = mediaResponseHeaders({
      headers: new Headers({ "Content-Type": "image/jpeg" }),
    });
    expect(headers.get("Cache-Control")).toBe(MEDIA_CACHE_CONTROL);
    expect(MEDIA_CACHE_CONTROL).toContain("public");
    expect(headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("applies the header to every file the collection serves", () => {
    const upload = Media.upload;
    expect(typeof upload === "object" && upload.modifyResponseHeaders).toBe(
      mediaResponseHeaders
    );
  });
});
