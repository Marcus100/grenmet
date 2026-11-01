import {
  capCategorySchema,
  capCertaintySchema,
  capSeveritySchema,
  capUrgencySchema,
} from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import { categoryKeys } from "@/lib/cap-hazards";
import {
  CERTAINTY_ORDER,
  SEVERITY_ORDER,
  URGENCY_ORDER,
} from "@/lib/cap-severity";
import { gmsCatalogueFixture } from "@/test/cap-gms-catalogue.fixture";

const sorted = (values: readonly string[]) => [...values].sort();

/** The desk offers only the CAP 1.2 enumerations: these lists must equal the API's. */
describe("the desk offers only CAP-enumerated values", () => {
  it("severity, urgency and certainty", () => {
    expect(sorted(SEVERITY_ORDER)).toEqual(sorted(capSeveritySchema.options));
    expect(sorted(URGENCY_ORDER)).toEqual(sorted(capUrgencySchema.options));
    expect(sorted(CERTAINTY_ORDER)).toEqual(sorted(capCertaintySchema.options));
  });

  it("categories (checkboxes come from the catalogue)", () => {
    expect(sorted(categoryKeys(gmsCatalogueFixture))).toEqual(
      sorted(capCategorySchema.options)
    );
  });
});
