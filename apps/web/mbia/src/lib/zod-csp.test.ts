import { describe, expect, it } from "vitest";
import { z } from "zod";
import { disableZodEvalProbe } from "./zod-csp";

describe("disableZodEvalProbe", () => {
  it("switches zod to jitless so object schemas never probe for eval", () => {
    disableZodEvalProbe();
    expect(z.config().jitless).toBe(true);
  });

  it("leaves parsing results unchanged", () => {
    disableZodEvalProbe();
    const schema = z.object({ name: z.string().min(2) });
    expect(schema.parse({ name: "Ann" })).toEqual({ name: "Ann" });
    expect(schema.safeParse({ name: "A" }).success).toBe(false);
  });
});
