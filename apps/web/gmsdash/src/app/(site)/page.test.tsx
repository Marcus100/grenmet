import { expect, it } from "vitest";
import { metadata } from "./page";

it("titles the home page once, without the layout template repeating the name", () => {
  expect(metadata.title).toEqual({ absolute: "GMS Dashboard" });
});
