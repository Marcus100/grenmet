import { describe, expect, it } from "vitest";
import type { EventDetail } from "@/domain/types";
import { makeEvent, makeGroup, makeOrganiser } from "@/test/factories";
import {
  draftFromEvent,
  draftIssues,
  draftToCard,
  draftToUpsert,
  emptyDraft,
} from "./event-draft";

const now = new Date("2026-10-03T12:00:00-04:00");
const sunset: EventDetail = {
  ...makeEvent({
    startsAt: "2026-10-03T20:00:00Z",
    endsAt: "2026-10-04T02:00:00Z",
  }),
  capacity: 1200,
  organiser: makeOrganiser(),
  group: makeGroup(),
  tiers: [
    {
      id: "t1",
      name: "General",
      allocation: 900,
      price: { amountMinor: 15_000, currency: "XCD" },
    },
    {
      id: "t2",
      name: "VIP",
      allocation: 300,
      price: { amountMinor: 30_000, currency: "XCD" },
    },
  ],
};

describe("draftFromEvent", () => {
  it("keeps ticket cents when an existing listing is saved", () => {
    const event = {
      ...sunset,
      tiers: sunset.tiers.map((tier) => ({
        ...tier,
        price: { ...tier.price, amountMinor: 2510 },
      })),
    };
    const draft = draftFromEvent(event);
    expect(draft.tiers[0]?.priceMajor).toBe(25.1);
    expect(draftToUpsert(draft, "draft").tiers?.[0]?.price_minor).toBe(2510);
    expect(draftToCard(draft).priceFrom?.amountMinor).toBe(2510);
  });

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

describe("draftToUpsert", () => {
  it("sends Grenada times with minor-unit prices and keeps carried fields", () => {
    const body = draftToUpsert(draftFromEvent(sunset), "published");
    expect(body.status).toBe("published");
    expect(body.starts_at).toBe("2026-10-03T16:00:00-04:00");
    expect(body.tiers?.[0]).toEqual({
      name: "General",
      price_minor: 15_000,
      currency: "XCD",
      allocation: 900,
    });
    expect(body.group_slug).toBe("anse-runners");
  });

  it("ends the next day when the end time is past midnight", () => {
    const draft = {
      ...draftFromEvent(sunset),
      startTime: "22:00",
      endTime: "02:00",
    };
    expect(draftToUpsert(draft, "draft").ends_at).toBe(
      "2026-10-04T02:00:00-04:00"
    );
    expect(draftIssues(draft)).toEqual([]);
  });

  it("sends no tiers for non-ticketed events", () => {
    const draft = { ...draftFromEvent(sunset), admission: "free" as const };
    expect(draftToUpsert(draft, "draft").tiers).toEqual([]);
  });
});
