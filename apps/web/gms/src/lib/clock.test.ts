import { describe, expect, it } from "vitest";
import { clock12 } from "@/lib/clock";

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
