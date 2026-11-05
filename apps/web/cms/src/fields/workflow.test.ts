import { describe, expect, it } from "vitest";
import {
  checkTakeOff,
  enforceReview,
  firstPublishedAt,
  stampPublication,
} from "./workflow";

describe("scheduled show and take-off times", () => {
  const now = new Date("2026-10-29T12:00:00.000Z");
  it("dates a future show-from time at that time, otherwise now", () => {
    expect(firstPublishedAt("2026-10-29T18:00:00.000Z", now)).toBe(
      "2026-10-29T18:00:00.000Z"
    );
    expect(firstPublishedAt("2026-10-29T08:00:00.000Z", now)).toBe(
      now.toISOString()
    );
    expect(firstPublishedAt(undefined, now)).toBe(now.toISOString());
  });
  it("needs the take-off time after the show-from time", () => {
    expect(
      checkTakeOff("2026-10-30T00:00:00.000Z", "2026-10-29T18:00:00.000Z")
    ).toBe(true);
    expect(
      checkTakeOff("2026-10-29T18:00:00.000Z", "2026-10-29T18:00:00.000Z")
    ).toBe("Take it off after the time it shows from.");
    expect(checkTakeOff(undefined, "2026-10-29T18:00:00.000Z")).toBe(true);
    expect(checkTakeOff("2026-10-30T00:00:00.000Z", null)).toBe(true);
  });
  it("stamps a new publication with its scheduled start", () => {
    // Always in the future: a fixed date stops being a scheduled start once
    // the clock passes it, and the hook then stamps "now" instead.
    const publishAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const data = stampPublication({
      data: { status: "published", publishAt },
      operation: "create",
      req: { user: { id: 3 } },
    } as never);
    expect(data).toMatchObject({ publishedAt: publishAt, author: 3 });
  });
});

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
