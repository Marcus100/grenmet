import type { Group, Organiser, PublicEvent } from "@/domain/types";

/** A published public event; override only what a test cares about. */
export function makeEvent(overrides: Partial<PublicEvent> = {}): PublicEvent {
  return {
    id: "evt-1",
    slug: "feel-free-sunset",
    title: "Feel Free Sunset",
    summary: "An all-inclusive sunset party.",
    description: "",
    category: "fete",
    parish: "st-george",
    venue: "Grand Anse Beach",
    startsAt: "2026-10-03T20:00:00Z",
    endsAt: "2026-10-04T01:00:00Z",
    admission: "ticketed",
    priceFrom: { amountMinor: 15_000, currency: "XCD" },
    recurrence: null,
    tags: [],
    featured: false,
    organiserSlug: "feel-free-promotions",
    goingCount: 3,
    goingNames: ["Dana Pierre", "Alex Charles", "Kemi Joseph"],
    viewerGoing: null,
    viewerSaved: null,
    ...overrides,
  };
}

export function makeOrganiser(overrides: Partial<Organiser> = {}): Organiser {
  return {
    id: "org-1",
    slug: "feel-free-promotions",
    name: "Feel Free Promotions",
    bio: "All-inclusive fetes.",
    verified: true,
    followerCount: 4210,
    viewerFollowing: null,
    ...overrides,
  };
}

export function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: "grp-1",
    slug: "anse-runners",
    name: "Anse Runners",
    tagline: "A free community run club.",
    category: "sport",
    parish: "st-george",
    joinPolicy: "open",
    memberCount: 12,
    nextMeetupAt: null,
    viewerStatus: null,
    ...overrides,
  };
}
