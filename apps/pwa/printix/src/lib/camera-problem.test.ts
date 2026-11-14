import { describe, expect, it } from "vitest";
import { cameraProblemFor } from "@/lib/camera-problem";

describe("cameraProblemFor", () => {
  it("recognises a refused permission", () => {
    expect(cameraProblemFor({ name: "NotAllowedError" })).toBe("denied");
  });

  it("recognises a busy or missing camera", () => {
    expect(cameraProblemFor({ name: "NotReadableError" })).toBe("in-use");
    expect(cameraProblemFor({ name: "NotFoundError" })).toBe("no-camera");
  });

  it("falls back for anything else", () => {
    expect(cameraProblemFor(new Error("boom"))).toBe("failed");
    expect(cameraProblemFor(null)).toBe("failed");
  });
});
