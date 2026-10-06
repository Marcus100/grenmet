import type { ListingUpsert } from "@barrelsgd/api-client";
import type { EventCardData } from "@/components/discovery/event-card";
import { money } from "@/domain/money";
import type {
  Admission,
  EventCategory,
  EventDetail,
  Parish,
} from "@/domain/types";
import { addDaysToKey, grenadaDateKey, grenadaWallClock } from "@/lib/datetime";

export interface TierDraft {
  readonly allocation: number;
  readonly id: string;
  readonly name: string;
  /** Decimal dollars as typed; rounded to integer minor units at the edge. */
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
  /** Carried through edits so saving never drops them. */
  readonly groupSlug: string | null;
  readonly parish: Parish;
  readonly recurrence: string | null;
  readonly startTime: string;
  readonly summary: string;
  readonly tags: readonly string[];
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

export function draftFromEvent(
  event: EventDetail & { readonly visibility?: "public" | "unlisted" }
): EventDraft {
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
    capacity: event.capacity,
    visibility: event.visibility ?? "public",
    recurrence: event.recurrence,
    tags: event.tags,
    groupSlug: event.group?.slug ?? null,
    tiers: event.tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      priceMajor: tier.price.amountMinor / 100,
      allocation: tier.allocation,
    })),
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
    recurrence: null,
    tags: [],
    groupSlug: null,
    tiers: [],
  };
}

export function draftStartsAt(draft: EventDraft): string {
  return `${draft.date}T${draft.startTime}:00${GRENADA_OFFSET}`;
}

/** End instant; an end time at or before the start means "after midnight". */
export function draftEndsAt(draft: EventDraft): string {
  const date =
    draft.endTime > draft.startTime ? draft.date : addDaysToKey(draft.date, 1);
  return `${date}T${draft.endTime}:00${GRENADA_OFFSET}`;
}

/** The API payload for saving this draft as a draft or a published listing. */
export function draftToUpsert(
  draft: EventDraft,
  status: "draft" | "published"
): ListingUpsert {
  return {
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    description: draft.description,
    category: draft.category,
    parish: draft.parish,
    venue: draft.venue.trim(),
    starts_at: draftStartsAt(draft),
    ends_at: draftEndsAt(draft),
    admission: draft.admission,
    capacity: draft.capacity,
    recurrence: draft.recurrence,
    tags: [...draft.tags],
    visibility: draft.visibility,
    status,
    group_slug: draft.groupSlug,
    tiers:
      draft.admission === "ticketed"
        ? draft.tiers.map((tier) => ({
            name: tier.name.trim(),
            price_minor: Math.round(tier.priceMajor * 100),
            currency: "XCD" as const,
            allocation: tier.allocation,
          }))
        : [],
  };
}

/** True when the API will accept this as a draft (publishing needs more). */
export function canSaveDraft(draft: EventDraft): boolean {
  return (
    draft.title.trim().length >= 3 &&
    draft.venue.trim().length >= 2 &&
    draft.summary.trim().length >= 10
  );
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
        ? money(Math.round(lowest * 100), "XCD")
        : null,
    recurrence: null,
    slug: "preview",
    goingCount: 0,
    goingNames: [],
    viewerSaved: false,
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
