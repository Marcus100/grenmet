import { describe, expect, it } from "vitest";
import { isOrganiserPath } from "@/organiser/routing";

describe("isOrganiserPath", () => {
  it("routes /organiser and what sits under it to the organiser screens", () => {
    expect(isOrganiserPath("/organiser")).toBe(true);
    expect(isOrganiserPath("/organiser/")).toBe(true);
    expect(isOrganiserPath("/organiser/events")).toBe(true);
  });

  it("leaves the gate scanner's address and other names alone", () => {
    expect(isOrganiserPath("/")).toBe(false);
    expect(isOrganiserPath("")).toBe(false);
    expect(isOrganiserPath("/organisers")).toBe(false);
    expect(isOrganiserPath("/organiserx")).toBe(false);
    expect(isOrganiserPath("/printix/organiser")).toBe(false);
  });
});
