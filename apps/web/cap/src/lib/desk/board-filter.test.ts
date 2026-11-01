import { describe, expect, it } from "vitest";
import { deskAlert, deskInfo } from "@/test/desk-alert.fixture";
import {
  ALL_STATES,
  type BoardSection,
  matchesSearch,
  visibleSections,
} from "./board-filter";

const RAIN = deskAlert({
  id: "aaaaaaaa-2222-4333-8444-555555555555",
  identifier: "gms-rain-001",
  info: [deskInfo({ headline: "Heavy rain for St Mark" })],
});
const WIND = deskAlert({
  id: "bbbbbbbb-2222-4333-8444-555555555555",
  identifier: "gms-wind-002",
  info: [deskInfo({ headline: "Strong wind for St David" })],
  lifecycle_state: "PUBLISHED",
});

const SECTIONS: BoardSection[] = [
  { alerts: [RAIN], empty: "No drafts.", state: "DRAFT", title: "Drafts" },
  {
    alerts: [],
    empty: "Nothing approved.",
    state: "APPROVED",
    title: "Approved",
  },
  {
    alerts: [WIND],
    empty: "No live alerts.",
    state: "PUBLISHED",
    title: "In force",
  },
];

describe("matchesSearch", () => {
  it("matches the headline and the identifier ignoring case", () => {
    expect(matchesSearch(RAIN, "HEAVY")).toBe(true);
    expect(matchesSearch(RAIN, "wind-002")).toBe(false);
    expect(matchesSearch(WIND, "gms-wind")).toBe(true);
  });

  it("matches everything for a blank search", () => {
    expect(matchesSearch(RAIN, "   ")).toBe(true);
  });
});

describe("visibleSections", () => {
  it("keeps every stage, empty ones included, under All", () => {
    const shown = visibleSections(SECTIONS, ALL_STATES, "");
    expect(shown.map((s) => s.title)).toEqual([
      "Drafts",
      "Approved",
      "In force",
    ]);
    expect(shown[1]?.alerts).toEqual([]);
  });

  it("narrows to one stage when a chip is chosen", () => {
    const shown = visibleSections(SECTIONS, "PUBLISHED", "");
    expect(shown.map((s) => s.title)).toEqual(["In force"]);
  });

  it("filters rows inside each stage without removing the stage", () => {
    const shown = visibleSections(SECTIONS, ALL_STATES, "rain");
    expect(shown).toHaveLength(3);
    expect(shown[0]?.alerts).toEqual([RAIN]);
    expect(shown[2]?.alerts).toEqual([]);
  });
});
