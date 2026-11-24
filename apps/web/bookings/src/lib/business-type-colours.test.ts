import { describe, expect, it } from "vitest";
import { contrastWithWhite, MIN_CONTRAST } from "./brand-colour";
import { INK, TYPE_FILL } from "./business-type-colours";
import { BUSINESS_TYPES } from "./business-types";

describe("type fills", () => {
  it("has a fill for every type, each distinct", () => {
    expect(Object.keys(TYPE_FILL).sort()).toEqual([...BUSINESS_TYPES].sort());
    expect(new Set(Object.values(TYPE_FILL)).size).toBe(BUSINESS_TYPES.length);
  });

  it.each(Object.entries(TYPE_FILL))(
    "%s carries white text at 4.5:1 or better",
    (_type, fill) => {
      expect(contrastWithWhite(fill)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  );

  it("keeps white text readable on the ink fill", () => {
    expect(contrastWithWhite(INK)).toBeGreaterThan(17);
  });
});
