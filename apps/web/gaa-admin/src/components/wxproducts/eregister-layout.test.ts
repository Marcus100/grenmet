import { expect, it } from "vitest";
import {
  cellUpdates,
  cellValue,
  FIELD_LABELS,
  type FieldColumn,
  REGISTER_FIELDS,
  REGISTER_KEYS,
  REGISTER_SECTIONS,
  TIME_MARKS,
} from "./eregister-layout";

const find = (id: string): FieldColumn => {
  const column = REGISTER_FIELDS.find((candidate) => candidate.id === id);
  if (!column) throw new Error(`no column ${id}`);
  return column;
};

const stored = { air_temp: "0280", day: "30", time_utc: "12" };

it("shows Date-Time as one YYGG cell over day and hour", () => {
  const dateTime = find("date_time");
  expect(cellValue(dateTime, stored)).toBe("3012");
  expect(cellUpdates(dateTime, "0723", stored).updates).toEqual([
    ["day", "07"],
    ["time_utc", "23"],
  ]);
});

it("splits a temperature into the paper's 1Sn cell and the TTT cell", () => {
  const sign = find("air_temp:sign");
  const digits = find("air_temp:digits");
  expect(cellValue(sign, stored)).toBe("10");
  expect(cellValue(digits, stored)).toBe("280");
  expect(cellUpdates(sign, "11", stored)).toEqual({
    lead: "1",
    updates: [["air_temp", "1280"]],
  });
  expect(cellUpdates(digits, "345", stored).updates).toEqual([
    ["air_temp", "0345"],
  ]);
});

it("keeps the sign while the digits are still being keyed", () => {
  const digits = find("air_temp:digits");
  const partial = { air_temp: "028" };
  const leads = { air_temp: "0" };
  expect(cellValue(digits, partial, leads)).toBe("28");
  expect(cellUpdates(digits, "280", partial, leads).updates).toEqual([
    ["air_temp", "0280"],
  ]);
});

it("leaves the sign open until it is keyed, storing plain TTT", () => {
  const digits = find("air_temp:digits");
  expect(cellUpdates(digits, "280", {}).updates).toEqual([["air_temp", "280"]]);
  expect(cellValue(find("air_temp:sign"), { air_temp: "280" })).toBe("");
});

it("stores only real fields and names issues by paper column", () => {
  expect(REGISTER_KEYS).toContain("wet_bulb");
  expect(REGISTER_KEYS).toContain("wind_gust");
  expect(REGISTER_KEYS).not.toContain("date_time");
  expect(FIELD_LABELS.time_utc).toBe("Date-Time GMT (YYGG)");
  expect(FIELD_LABELS.wind_gust).toBe("Gust (fmfm)");
});

it("numbers the columns like the paper register, 1 to 65", () => {
  const numbers = REGISTER_SECTIONS.flatMap((section) =>
    section.columns.flatMap((column) => (column.no ? [column.no] : []))
  );
  expect(Math.max(...numbers)).toBe(65);
  expect(new Set(numbers).size).toBe(numbers.length);
  // Every paper column is built, including 17 (barometer as read).
  const missing = Array.from({ length: 65 }, (_, i) => i + 1).filter(
    (n) => !numbers.includes(n)
  );
  expect(missing).toEqual([]);
});

it("keys the barometer as read in column 17 and the 909 group and time marks", () => {
  expect(find("barometer_reading").no).toBe(17);
  expect(REGISTER_KEYS).toContain("barometer_reading");
  expect(REGISTER_KEYS).toContain("s3_group_909");
  expect(TIME_MARKS.map((mark) => mark.key)).toEqual([
    "time_mark_anemograph",
    "time_mark_barograph",
    "time_mark_rain_recorder",
    "time_mark_thermohygrograph",
  ]);
  for (const mark of TIME_MARKS) expect(REGISTER_KEYS).toContain(mark.key);
});

it("types visibility in kilometres above a calculated VV cell", () => {
  const visibility = find("visibility");
  expect(visibility.upper?.key).toBe("visibility_km");
  expect(visibility.computed).toBe(true);
  expect(REGISTER_KEYS).toContain("visibility_km");
  expect(FIELD_LABELS.visibility_km).toBe("Visibility in km");
});

it("calculates dew point (both cells) and relative humidity, never keying them", () => {
  const calculated = REGISTER_FIELDS.filter((column) => column.computed).map(
    (column) => column.id
  );
  expect(calculated).toEqual([
    "visibility",
    "dew_point:sign",
    "dew_point:digits",
    "relative_humidity",
  ]);
  // The wet bulb stays an entry above the dew point.
  expect(find("dew_point:digits").upper?.key).toBe("wet_bulb");
});

it("hints the 24 h pressure change j1 as 8 in the sign cell placeholder", () => {
  expect(find("s3_baro_change_24h:sign").signed?.example).toBe("8");
  expect(find("air_temp:sign").signed?.example).toBe("0");
});
