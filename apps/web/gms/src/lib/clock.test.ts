import { describe, expect, it } from "vitest";
import { clock12, stampLabel, wallClockLabel } from "@/lib/clock";

describe("clock12", () => {
  it.each([
    ["05:58", {}, "5:58 a.m."],
    ["17:00", {}, "5:00 p.m."],
    ["00:15", {}, "12:15 a.m."],
    ["12:30", {}, "12:30 p.m."],
    ["5:42", { afternoon: true }, "5:42 p.m."],
    ["18:02", { afternoon: true }, "6:02 p.m."],
    ["6:10 pm", {}, "6:10 p.m."],
    ["12:05 a.m.", {}, "12:05 a.m."],
  ] as const)("reads %s as %s", (text, options, expected) => {
    expect(clock12(text, options)).toBe(expected);
  });

  it("leaves text that is not a time alone", () => {
    expect(clock12("Not issued")).toBe("Not issued");
    expect(clock12("25:00")).toBe("25:00");
  });
});

describe("stampLabel", () => {
  it("gives an archive time in Grenada, with the year and zone", () => {
    expect(stampLabel("2026-11-10T22:24:24Z")).toBe(
      "10 Nov 2026 at 6:24 p.m. AST"
    );
    expect(stampLabel("2026-11-11T03:05:00Z")).toBe(
      "10 Nov 2026 at 11:05 p.m. AST"
    );
  });

  it("returns text it cannot read unchanged", () => {
    expect(stampLabel("not a time")).toBe("not a time");
  });
});

describe("wallClockLabel", () => {
  it("writes a stored Grenada time in words without shifting it", () => {
    expect(wallClockLabel("2026-11-10T07:00")).toBe("10 Nov 2026, 7:00 a.m.");
    expect(wallClockLabel("2026-11-10 18:00")).toBe("10 Nov 2026, 6:00 p.m.");
  });

  it("returns anything else readable, never with a bare T", () => {
    expect(wallClockLabel("")).toBe("");
    expect(wallClockLabel("soonTlater")).toBe("soon later");
  });
});
