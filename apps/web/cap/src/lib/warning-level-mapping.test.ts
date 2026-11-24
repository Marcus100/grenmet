import { describe, expect, it } from "vitest";
import {
  severityLevel,
  WARNING_LEVEL_COLOUR_NAME,
  WARNING_LEVEL_LABEL,
  WARNING_LEVEL_SURFACE,
  warningLevelHeading,
} from "@/lib/alerts";

describe("the public sees the issued colour", () => {
  it.each([
    ["Minor", "Green", "Green alert", "bg-gm-warning-green-bg"],
    ["Moderate", "Yellow", "Be aware", "bg-gm-warning-yellow-bg"],
    ["Severe", "Orange", "Be prepared", "bg-gm-warning-amber-bg"],
    ["Extreme", "Red", "Take action now", "bg-gm-warning-red-bg"],
  ] as const)("%s is %s with the words %s", (severity, colour, words, bg) => {
    const level = severityLevel(severity);
    expect(WARNING_LEVEL_COLOUR_NAME[level]).toBe(colour);
    expect(WARNING_LEVEL_LABEL[level]).toBe(words);
    expect(WARNING_LEVEL_SURFACE[level]).toContain(bg);
  });

  it("keeps Orange and Red apart", () => {
    const orange = severityLevel("Severe");
    const red = severityLevel("Extreme");
    expect(orange).not.toBe(red);
    expect(WARNING_LEVEL_SURFACE[orange]).not.toBe(WARNING_LEVEL_SURFACE[red]);
  });

  it("claims no colour for an unstated severity", () => {
    const level = severityLevel("Unknown");
    expect(level).toBe("not-stated");
    expect(WARNING_LEVEL_LABEL[level]).toBe("Severity not stated");
    expect(WARNING_LEVEL_SURFACE[level]).toContain("bg-gm-warning-grey-bg");
    expect(warningLevelHeading(level)).toBe("Severity not stated");
  });

  it("prints the colour name with the action words", () => {
    expect(warningLevelHeading("be-prepared")).toBe("Orange · Be prepared");
    expect(warningLevelHeading("green")).toBe("Green alert");
  });
});
