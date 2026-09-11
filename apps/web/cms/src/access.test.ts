import { describe, expect, it } from "vitest";
import { isEditor } from "./access";

describe("publishing roles", () => {
  it("requires a designated editor", () => {
    expect(isEditor(null)).toBe(false);
    expect(isEditor({ id: 1, role: "author" })).toBe(false);
    expect(isEditor({ id: 2, role: "editor" })).toBe(true);
  });
});
