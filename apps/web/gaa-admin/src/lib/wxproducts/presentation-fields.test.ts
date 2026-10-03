import {
  displayProductFields,
  presentationFields,
} from "@barrelsgd/gms/products";
import { expect, it } from "vitest";

const keys = (fields: { key: string }[]) => fields.map((f) => f.key);

it("shows composed text instead of structured inputs to readers", () => {
  const marine = keys(presentationFields("marine"));
  expect(marine).toEqual(expect.arrayContaining(["wind", "seaState"]));
  expect(marine).not.toEqual(
    expect.arrayContaining(["windDirFrom", "waveHeightMin", "tide1Time"])
  );
  const evening = keys(presentationFields("evening"));
  expect(evening).toContain("day2Wind");
  expect(evening).not.toContain("day2WindSpeedMin");
  expect(evening).not.toContain("advisories");
});

it("keeps structured inputs in the editor field list", () => {
  expect(keys(displayProductFields("marine"))).toEqual(
    expect.arrayContaining(["windDirFrom", "waveHeightMin", "tide1Time"])
  );
  expect(keys(presentationFields("cyclone"))).toContain("wind");
});

it("shows composed visibility, not the km inputs", () => {
  const dust = keys(presentationFields("dust"));
  expect(dust).toContain("visibility");
  expect(dust).not.toContain("visibilityMin");
});
