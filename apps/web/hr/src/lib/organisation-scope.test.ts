import { describe, expect, it } from "vitest";
import { scopeLabel } from "@/lib/organisation-scope";

describe("scopeLabel", () => {
  it("names each scope in words", () => {
    expect(scopeLabel("SELF")).toBe("Own record only");
    expect(scopeLabel("DEPARTMENT")).toBe("Your department");
    expect(scopeLabel("ALL")).toBe("Whole organisation");
  });
});
