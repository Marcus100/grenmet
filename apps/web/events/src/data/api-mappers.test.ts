import type { ListingCard, ListingDetail } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  toDoorAdmission,
  toDoorManifest,
  toEvent,
  toEventDetail,
  toGroup,
  toMyTicketDetail,
  toThread,
} from "./api-mappers";

const card: ListingCard = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "feel-free-sunset",
  title: "Feel Free Sunset",
  summary: "An all-inclusive sunset party.",
  category: "fete",
  parish: "st-george",
  venue: "Grand Anse",
  starts_at: "2026-10-03T20:00:00Z",
  ends_at: "2026-10-04T01:00:00Z",
  admission: "ticketed",
  price_from_minor: 15_000,
  currency: "XCD",
  recurrence: null,
  tags: ["spicemas"],
  featured: true,
  organiser_slug: "feel-free",
  going_count: 40,
  going_preview: [{ handle: "dana", display_name: "Dana Pierre" }],
};

describe("toEvent", () => {
  it("maps a listing card, keeping the true going total", () => {
    const event = toEvent(card);
    expect(event.priceFrom).toEqual({ amountMinor: 15_000, currency: "XCD" });
    expect(event.goingCount).toBe(40);
    expect(event.goingNames).toEqual(["Dana Pierre"]);
    expect(event.organiserSlug).toBe("feel-free");
  });

  it("treats missing viewer state as null (visitor), not false", () => {
    const event = toEvent(card);
    expect(event.viewerGoing).toBeNull();
    expect(event.viewerSaved).toBeNull();
    expect(toEvent({ ...card, viewer_going: true }).viewerGoing).toBe(true);
  });

  it("has no price unless ticketed", () => {
    expect(
      toEvent({ ...card, admission: "free", price_from_minor: null }).priceFrom
    ).toBeNull();
  });
});

describe("toEventDetail", () => {
  it("maps organiser, group and tiers", () => {
    const detail: ListingDetail = {
      ...card,
      description: "Doors at four.",
      capacity: 1200,
      organiser: {
        id: "o1",
        slug: "feel-free",
        name: "Feel Free",
        bio: "Fetes.",
        verified: true,
        follower_count: 10,
        viewer_following: false,
      },
      group: null,
      tiers: [
        {
          id: "t1",
          name: "General",
          price_minor: 15_000,
          currency: "XCD",
          allocation: 900,
          per_account_limit: 2,
          remaining: 850,
          held: 1,
        },
      ],
    };
    const mapped = toEventDetail(detail);
    expect(mapped.organiser.viewerFollowing).toBe(false);
    expect(mapped.group).toBeNull();
    expect(mapped.tiers[0]?.price.amountMinor).toBe(15_000);
    expect(mapped.tiers[0]).toMatchObject({
      perAccountLimit: 2,
      remaining: 850,
      held: 1,
    });
    expect(mapped.capacity).toBe(1200);
  });
});

describe("toGroup", () => {
  it("keeps the viewer's membership status", () => {
    const group = toGroup({
      id: "g1",
      slug: "runners",
      name: "Runners",
      tagline: "Run.",
      category: "sport",
      parish: "st-george",
      join_policy: "approval",
      member_count: 5,
      viewer_status: "pending",
    });
    expect(group.joinPolicy).toBe("approval");
    expect(group.viewerStatus).toBe("pending");
    expect(group.nextMeetupAt).toBeNull();
  });
});

describe("toThread", () => {
  it("maps who wrote each message and whether the viewer can reply", () => {
    const thread = toThread({
      id: "t1",
      kind: "direct",
      title: "Dana",
      group_slug: null,
      can_send: false,
      participants: [{ handle: "dana", display_name: "Dana Pierre" }],
      messages: [
        {
          id: "m1",
          body: "Hi",
          sent_at: "2026-10-03T20:00:00Z",
          mine: false,
          author: { handle: "dana", display_name: "Dana Pierre" },
        },
      ],
    });
    expect(thread.canSend).toBe(false);
    expect(thread.messages[0]?.author?.name).toBe("Dana Pierre");
  });
});

describe("tickets and the door", () => {
  it("maps a ticket with its QR token and admission state", () => {
    const ticket = toMyTicketDetail({
      id: "k1",
      code: "AAAAA-BBBBB",
      status: "valid",
      tier_name: "Free",
      listing_slug: "free-night",
      listing_title: "Free Night",
      venue: "Carenage",
      parish: "st-george",
      starts_at: "2026-10-30T22:00:00Z",
      ends_at: "2026-10-31T02:00:00Z",
      can_cancel: true,
      qr_token: "BT1.AAAAABBBBB.tag",
    });
    expect(ticket).toMatchObject({
      listingSlug: "free-night",
      qrToken: "BT1.AAAAABBBBB.tag",
      admittedAt: null,
      canCancel: true,
    });
  });

  it("maps the manifest and an admission", () => {
    const manifest = toDoorManifest({
      listing_id: "evt",
      title: "Free Night",
      starts_at: "2026-10-30T22:00:00Z",
      generated_at: "2026-10-30T20:00:00Z",
      issued: 1,
      admitted: 0,
      waiting: 1,
      cancelled: 2,
      rows: [
        {
          ticket_id: "k1",
          code: "AAAAA-BBBBB",
          tier_name: "Free",
        },
      ],
    });
    expect(manifest.rows[0]).toEqual({
      ticketId: "k1",
      code: "AAAAA-BBBBB",
      holderName: null,
      tierName: "Free",
      admittedAt: null,
    });
    expect(manifest.waiting).toBe(1);
    expect(
      toDoorAdmission({
        ticket_id: "k1",
        code: "AAAAA-BBBBB",
        tier_name: "Free",
        admitted_at: "2026-10-30T22:30:00Z",
      }).repeat
    ).toBe(false);
  });
});
