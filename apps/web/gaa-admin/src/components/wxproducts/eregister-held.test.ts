import { describe, expect, it } from "vitest";
import { holdsValues } from "./eregister-held";

describe("holdsValues", () => {
  const values = { air_temp: "0254", wind_dir: "07" };

  it("is true when the record holds exactly these values, whatever its bookkeeping keys", () => {
    expect(
      holdsValues({ ...values, source: "eregister-workbook" }, values)
    ).toBe(true);
  });

  it("is false when any value differs", () => {
    expect(holdsValues({ air_temp: "0255", wind_dir: "07" }, values)).toBe(
      false
    );
  });

  it("is false when a value is missing from the record", () => {
    expect(holdsValues({ air_temp: "0254" }, values)).toBe(false);
  });

  it("is false when the record holds a filled-in value the form does not", () => {
    expect(holdsValues({ ...values, rain_24h: "0012" }, values)).toBe(false);
  });

  it("ignores empty values on the record", () => {
    expect(holdsValues({ ...values, rain_24h: "" }, values)).toBe(true);
  });

  it("is false for a record without a body", () => {
    expect(holdsValues(undefined, values)).toBe(false);
  });
});
