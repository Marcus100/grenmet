import { describe, expect, it } from "vitest";
import { buildDemoEvents } from "@/data/community-fixtures";
import {
  draftFromEvent,
  draftIssues,
  draftToCard,
  emptyDraft,
} from "./event-draft";

const now = new Date("2026-10-03T12:00:00-04:00");
const sunset = buildDemoEvents(now).find(
  (event) => event.slug === "feel-free-sunset"
);
if (!sunset) {
  throw new Error("fixture missing");
}

describe("draftFromEvent", () => {
  it("round-trips Grenada date and times", () => {
    const draft = draftFromEvent(sunset);
    expect(draft.date).toBe("2026-10-03");
    expect(draft.startTime).toBe("16:00");
    expect(draftToCard(draft).startsAt).toBe("2026-10-03T16:00:00-04:00");
  });
});

describe("draftToCard", () => {
  it("prices from the cheapest tier", () => {
    const card = draftToCard(draftFromEvent(sunset));
    expect(card.priceFrom).toEqual({ amountMinor: 15_000, currency: "XCD" });
  });

  it("shows placeholders for an empty draft", () => {
    const card = draftToCard(emptyDraft(now));
    expect(card.title).toBe("Untitled event");
    expect(card.priceFrom).toBeNull();
  });
});

describe("draftIssues", () => {
  it("passes a complete listing", () => {
    expect(draftIssues(draftFromEvent(sunset))).toEqual([]);
  });

  it("flags missing basics on an empty draft", () => {
    expect(draftIssues(emptyDraft(now))).toEqual([
      "Add an event name.",
      "Add a venue.",
      "Write a one-line summary (at least 10 characters).",
    ]);
  });

  it("flags tier allocations above capacity", () => {
    const draft = { ...draftFromEvent(sunset), capacity: 1000 };
    expect(draftIssues(draft)).toContain(
      "Tier allocations (1,200) exceed capacity (1,000)."
    );
  });
});
