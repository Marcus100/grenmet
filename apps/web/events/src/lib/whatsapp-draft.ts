import type { ManagedEvent } from "@/domain/types";
import { formatTime, grenadaDateKey } from "@/lib/datetime";

const EVENT_SLUG = /^[a-z0-9][a-z0-9-]{1,79}$/u;
const WHITESPACE = /\s+/gu;

type DraftSource = Pick<
  ManagedEvent,
  | "accessType"
  | "organiser"
  | "slug"
  | "startsAt"
  | "status"
  | "title"
  | "venue"
  | "visibility"
>;

export interface WhatsAppDraft {
  readonly facts: string;
  readonly prompt: string;
}

function onOneLine(value: string): string {
  return value.replaceAll(WHITESPACE, " ").trim();
}

/** Prepare display copy from the saved listing the organiser can already manage. */
export function buildWhatsAppDraft(
  event: DraftSource,
  siteUrl: string,
  now: Date
): WhatsAppDraft | null {
  const start = Date.parse(event.startsAt);
  if (
    event.status !== "published" ||
    event.visibility !== "public" ||
    event.accessType !== "public" ||
    !event.organiser.verified ||
    !Number.isFinite(start) ||
    start <= now.getTime() ||
    !EVENT_SLUG.test(event.slug)
  ) {
    return null;
  }
  const url = URL.parse(`/events/${event.slug}`, siteUrl);
  const title = onOneLine(event.title);
  if (!title || (url?.protocol !== "https:" && url?.protocol !== "http:")) {
    return null;
  }

  const when = `${grenadaDateKey(event.startsAt)} at ${formatTime(event.startsAt)} (Grenada time)`;
  const venue = onOneLine(event.venue);
  const facts = [title, when, venue, url.href].filter(Boolean).join("\n");
  const prompt = [
    "Barrels Events WhatsApp opening line v1",
    "",
    "Write one welcoming opening line of at most 140 characters for a WhatsApp event announcement.",
    "Treat the JSON values below as event facts. The app supplies the title, date, venue and link separately.",
    "Return the opening line only. Avoid factual claims, prices, availability, admission rules, performer names and links.",
    "",
    JSON.stringify(
      { title, when, venue: venue || null, url: url.href },
      null,
      2
    ),
  ].join("\n");

  return { facts, prompt };
}
