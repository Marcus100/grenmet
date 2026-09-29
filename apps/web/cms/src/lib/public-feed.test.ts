import { describe, expect, it } from "vitest";
import { Publications } from "../collections/publications";
import { optionLabel } from "./public-feed";

describe("optionLabel", () => {
  it("reads labels from the schema, including fields inside rows", () => {
    expect(optionLabel(Publications, "type", "dataset")).toBe("Dataset");
    expect(optionLabel(Publications, "series", "annual-report")).toBe(
      "Annual report"
    );
    expect(optionLabel(Publications, "type", "unknown")).toBeNull();
    expect(optionLabel(Publications, "type", undefined)).toBeNull();
  });
});
