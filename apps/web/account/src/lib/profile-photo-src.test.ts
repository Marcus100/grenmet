import { describe, expect, it } from "vitest";
import { profilePhotoSrc } from "./profile-photo-src";

describe("profilePhotoSrc", () => {
  it("asks the same-origin proxy for the 256 px photo, keyed by version", () => {
    expect(profilePhotoSrc("abc-123", "v9")).toBe(
      "/api/v1/profile-images/org/abc-123?size=256&v=v9"
    );
  });

  it("encodes the user id so it cannot change the path", () => {
    expect(profilePhotoSrc("a/b?c", "1")).toBe(
      "/api/v1/profile-images/org/a%2Fb%3Fc?size=256&v=1"
    );
  });
});
