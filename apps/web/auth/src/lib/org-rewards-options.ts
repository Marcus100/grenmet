/**
 * Form choices for the organisation rewards admin. The API validates every
 * value; these only fill the selects.
 */

/**
 * Qualifying sources a stamp card can reward (`src/rewards/sources.py`; the API
 * has no catalogue endpoint yet). Each is a completed real-world action, never
 * attention such as opening the app.
 */
export const QUALIFYING_SOURCES = [
  {
    description: "A ticket scanned at the door.",
    key: "events.admission",
    label: "Event admission",
  },
  {
    description: "An appointment that took place.",
    key: "bookings.completed",
    label: "Completed booking",
  },
  {
    description: "An invoice settled in full.",
    key: "billing.invoice_paid",
    label: "Paid invoice",
  },
  {
    description: "A payment that succeeded.",
    key: "payments.succeeded",
    label: "Successful payment",
  },
  {
    description: "A visit proven by scanning the venue's rotating QR code.",
    key: "rewards.venue_check_in",
    label: "Venue check-in",
  },
] as const;

export function sourceLabel(key: string): string {
  return QUALIFYING_SOURCES.find((source) => source.key === key)?.label ?? key;
}

export const TRAIL_KINDS = ["custom", "parish", "festival"] as const;
export const TRAIL_STATUSES = ["active", "draft"] as const;
export const CHALLENGE_METRICS = [
  { key: "venue_check_ins", label: "Venue check-ins" },
  { key: "trail_stops", label: "Trail stops visited" },
  { key: "events_attended", label: "Events attended" },
] as const;
export const ACHIEVEMENT_RULES = [
  { key: "attended_n_events", label: "Attended a number of events" },
  { key: "visited_all_stops_of_trail", label: "Visited every stop of a trail" },
  { key: "streak_days", label: "Checked in on consecutive days" },
] as const;

/** Organisation ids are `org_<hex>`, or a legacy slug-like id such as `gaa`. */
export const ORGANISATION_ID = /^[A-Za-z0-9_-]{1,64}$/;

const SMALL_NUMBER = /^\d{1,6}$/;
const ACHIEVEMENT_KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export interface AchievementFields {
  readonly days: string;
  readonly key: string;
  readonly n: string;
  readonly name: string;
  readonly ruleType: string;
  readonly trailId: string;
}

export type AchievementParameters =
  | { readonly n: number }
  | { readonly trail_id: string }
  | { readonly days: number };

export type AchievementCheck =
  | { readonly ok: true; readonly parameters: AchievementParameters }
  | { readonly ok: false; readonly message: string };

function wholeNumber(text: string): number | undefined {
  return SMALL_NUMBER.test(text.trim()) ? Number(text) : undefined;
}

/** Mirrors the API's rule checks so mistakes show before a round trip. */
export function checkAchievement(fields: AchievementFields): AchievementCheck {
  if (!ACHIEVEMENT_KEY.test(fields.key) || fields.key.length < 2) {
    return {
      message:
        "The key must be lowercase words joined by hyphens, for example parish-explorer.",
      ok: false,
    };
  }
  if (fields.name.trim().length === 0) {
    return { message: "Give the achievement a name.", ok: false };
  }
  if (fields.ruleType === "attended_n_events") {
    const n = wholeNumber(fields.n);
    if (n === undefined || n < 1 || n > 1000) {
      return {
        message: "Events needed must be a whole number from 1 to 1000.",
        ok: false,
      };
    }
    return { ok: true, parameters: { n } };
  }
  if (fields.ruleType === "streak_days") {
    const days = wholeNumber(fields.days);
    if (days === undefined || days < 2 || days > 365) {
      return {
        message: "Days in a row must be a whole number from 2 to 365.",
        ok: false,
      };
    }
    return { ok: true, parameters: { days } };
  }
  if (fields.ruleType === "visited_all_stops_of_trail") {
    if (!isUuid(fields.trailId)) {
      return { message: "Choose the trail to complete.", ok: false };
    }
    return { ok: true, parameters: { trail_id: fields.trailId } };
  }
  return { message: "Choose a rule.", ok: false };
}
