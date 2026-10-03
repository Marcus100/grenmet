import type { EventCardData } from "@/components/discovery/event-card";
import { money } from "@/domain/money";
import type {
  Admission,
  EventCategory,
  Parish,
  PublicEvent,
} from "@/domain/types";
import { grenadaDateKey, grenadaWallClock } from "@/lib/datetime";

export interface TierDraft {
  readonly allocation: number;
  readonly id: string;
  readonly name: string;
  /** Whole EC dollars as typed; converted to minor units at the edge. */
  readonly priceMajor: number;
}

/** Editor state for an event listing. Plain values so inputs bind directly. */
export interface EventDraft {
  readonly admission: Admission;
  readonly capacity: number;
  readonly category: EventCategory;
  readonly date: string;
  readonly description: string;
  readonly endTime: string;
  readonly parish: Parish;
  readonly startTime: string;
  readonly summary: string;
  readonly tiers: readonly TierDraft[];
  readonly title: string;
  readonly venue: string;
  readonly visibility: "public" | "unlisted";
}

const GRENADA_OFFSET = "-04:00";

function timeOf(instant: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Grenada",
  }).format(new Date(instant));
}

export function draftFromEvent(event: PublicEvent): EventDraft {
  const price = event.priceFrom
    ? Math.trunc(event.priceFrom.amountMinor / 100)
    : 0;
  return {
    title: event.title,
    summary: event.summary,
    description: event.description,
    category: event.category,
    parish: event.parish,
    venue: event.venue,
    date: grenadaDateKey(event.startsAt),
    startTime: timeOf(event.startsAt),
    endTime: timeOf(event.endsAt),
    admission: event.admission,
    capacity: 1200,
    visibility: "public",
    tiers:
      event.admission === "ticketed"
        ? [
            {
              id: "tier_1",
              name: "General",
              priceMajor: price,
              allocation: 900,
            },
            {
              id: "tier_2",
              name: "VIP",
              priceMajor: price * 2,
              allocation: 300,
            },
          ]
        : [],
  };
}

export function emptyDraft(now: Date): EventDraft {
  return {
    title: "",
    summary: "",
    description: "",
    category: "fete",
    parish: "st-george",
    venue: "",
    date: grenadaDateKey(grenadaWallClock(now, 14, "12:00")),
    startTime: "19:00",
    endTime: "23:00",
    admission: "free",
    capacity: 200,
    visibility: "public",
    tiers: [],
  };
}

export function draftStartsAt(draft: EventDraft): string {
  return `${draft.date}T${draft.startTime}:00${GRENADA_OFFSET}`;
}

/** What the public card will show, so the preview cannot drift from the site. */
export function draftToCard(draft: EventDraft): EventCardData {
  const prices = draft.tiers
    .map((tier) => tier.priceMajor)
    .filter((price) => price > 0);
  const lowest = prices.length > 0 ? Math.min(...prices) : null;

  return {
    title: draft.title.trim() || "Untitled event",
    category: draft.category,
    parish: draft.parish,
    venue: draft.venue.trim() || "Venue to be confirmed",
    startsAt: draftStartsAt(draft),
    admission: draft.admission,
    priceFrom:
      draft.admission === "ticketed" && lowest !== null
        ? money(lowest * 100, "XCD")
        : null,
    recurrence: null,
    slug: "preview",
    goingNames: [],
    goingTotal: 0,
  };
}

/** Publish checklist. Empty means the listing can go live. */
export function draftIssues(draft: EventDraft): string[] {
  const issues: string[] = [];
  if (!draft.title.trim()) {
    issues.push("Add an event name.");
  }
  if (!draft.venue.trim()) {
    issues.push("Add a venue.");
  }
  if (draft.summary.trim().length < 10) {
    issues.push("Write a one-line summary (at least 10 characters).");
  }
  if (draft.endTime <= draft.startTime && draft.endTime !== "00:00") {
    issues.push("End time must be after the start time.");
  }
  if (draft.admission === "ticketed") {
    if (draft.tiers.length === 0) {
      issues.push("Add at least one ticket tier.");
    }
    if (draft.tiers.some((tier) => tier.priceMajor <= 0 || !tier.name.trim())) {
      issues.push("Every ticket tier needs a name and a price.");
    }
    const allocated = draft.tiers.reduce(
      (total, tier) => total + tier.allocation,
      0
    );
    if (allocated > draft.capacity) {
      issues.push(
        `Tier allocations (${allocated.toLocaleString("en-US")}) exceed capacity (${draft.capacity.toLocaleString("en-US")}).`
      );
    }
  }
  return issues;
}
