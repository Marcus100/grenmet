import { describe, expect, it } from "vitest";
import { metadata } from "./page";

describe("cms sign-in title", () => {
  it("names GMS content so each sign-in tab reads differently", () => {
    expect(metadata.title).toBe("Sign in | GMS content");
  });
});
