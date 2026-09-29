import { describe, expect, it } from "vitest";
import { DeskUpdates } from "../collections/desk-updates";
import { optionLabel } from "./public-feed";

describe("optionLabel", () => {
  it("reads labels from the schema", () => {
    expect(optionLabel(DeskUpdates, "kind", "public-notice")).toBe(
      "Public notice"
    );
    expect(optionLabel(DeskUpdates, "product", "tropical-outlook")).toBe(
      "Tropical weather outlook"
    );
    expect(optionLabel(DeskUpdates, "kind", "unknown")).toBeNull();
    expect(optionLabel(DeskUpdates, "kind", undefined)).toBeNull();
  });
});
