import { describe, expect, it } from "vitest";
import { profileImageUrl } from "./profile-image";

describe("profileImageUrl", () => {
  it("links the photo route through the same-origin proxy", () => {
    expect(profileImageUrl("4b6f0f3e-2a1d-4c4b-9a65-0d2f1d9b7c11")).toBe(
      "/api/v1/profile-images/org/4b6f0f3e-2a1d-4c4b-9a65-0d2f1d9b7c11?size=64"
    );
  });

  it("asks for the larger stored sizes", () => {
    expect(profileImageUrl("u1", 256)).toBe(
      "/api/v1/profile-images/org/u1?size=256"
    );
  });
});
