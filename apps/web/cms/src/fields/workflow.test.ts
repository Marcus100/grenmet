import { describe, expect, it } from "vitest";
import { enforceReview } from "./workflow";

const hook = enforceReview("cms.publish.stories");
const run = (data: Record<string, unknown>, original: unknown, user: unknown) =>
  hook({ data, originalDoc: original, req: { user } } as never);

describe("review before publication", () => {
  const publisher = { id: 1, permissionKeys: ["cms.publish.stories"] };
  it("needs the section's publish key", () => {
    expect(() =>
      run(
        { status: "published" },
        { status: "review" },
        {
          id: 2,
          permissionKeys: ["cms.publish.desk-updates"],
        }
      )
    ).toThrow("permission");
    expect(
      run({ status: "published" }, { status: "review" }, publisher)
    ).toEqual({
      status: "published",
    });
  });
  it("needs a review step first and a signed-in user", () => {
    expect(() =>
      run({ status: "published" }, { status: "draft" }, publisher)
    ).toThrow("review");
    expect(() => run({ status: "draft" }, undefined, null)).toThrow("Sign in");
  });
});
