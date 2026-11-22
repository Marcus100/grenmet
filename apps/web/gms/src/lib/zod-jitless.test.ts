import { describe, expect, it } from "vitest";
import { config, z } from "zod";
import "./zod-jitless";

describe("zod jitless mode", () => {
  it("is on once the module is imported, so no browser eval probe runs", () => {
    expect(config().jitless).toBe(true);
  });

  it("still parses objects with the same results", () => {
    const schema = z.object({ name: z.string(), count: z.number() });
    expect(schema.parse({ name: "Grenada", count: 2 })).toEqual({
      name: "Grenada",
      count: 2,
    });
    expect(schema.safeParse({ name: 1 }).success).toBe(false);
  });
});
