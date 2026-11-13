import { describe, expect, it } from "vitest";
import { profilePhotoSrc } from "./profile-photo-src";

describe("profilePhotoSrc", () => {
  it("asks the same-origin proxy for your own 256 px photo, keyed by version", () => {
    expect(profilePhotoSrc("v9")).toBe(
      "/api/v1/profile-images/me/image?size=256&v=v9"
    );
  });

  it("encodes the version as a query value", () => {
    expect(profilePhotoSrc("a&b")).toBe(
      "/api/v1/profile-images/me/image?size=256&v=a%26b"
    );
  });
});
