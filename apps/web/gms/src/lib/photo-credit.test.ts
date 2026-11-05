import { describe, expect, it } from "vitest";
import { photoCredit } from "@/lib/photo-credit";

describe("photoCredit", () => {
  it("keeps the credit the CMS sends", () => {
    expect(photoCredit("Photo: Kendra Mitchell")).toBe(
      "Photo: Kendra Mitchell"
    );
  });

  it("says Photo: GMS when the credit is missing or blank", () => {
    expect(photoCredit(null)).toBe("Photo: GMS");
    expect(photoCredit(undefined)).toBe("Photo: GMS");
    expect(photoCredit("   ")).toBe("Photo: GMS");
  });
});
