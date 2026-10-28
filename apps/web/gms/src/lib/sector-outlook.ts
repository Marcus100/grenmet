import type { SectorOutlook } from "@barrelsgd/api-client";
import { SECTORS, type SectorKey } from "@barrelsgd/gms/sectors";
import { warningHref } from "@/lib/warning-detail";

/** One alert or warning as a sector tile shows it. */
export interface SectorItem {
  /** Applies to every sector because nobody tagged it. */
  everyone: boolean;
  href: string | null;
  id: string;
  /** "Orange level", "Green level" or "Outlook": words, never colour alone. */
  level: string;
  summary: string;
  title: string;
  /** "In effect until Fri 30 Oct", "Thu 29 Oct to Fri 30 Oct", ... */
  when: string;
}

export interface SectorTile {
  items: SectorItem[];
  /** Items beyond the ones shown; the tile links to all alerts for them. */
  more: number;
  sector: SectorKey;
}

const DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Grenada",
  weekday: "short",
  day: "numeric",
  month: "short",
});
const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Grenada",
});
const SENTENCE_END = /^(.+?[.!?])(\s|$)/;
const SUMMARY_LIMIT = 140;

const dayKey = (date: Date) => DAY_KEY.format(date);

/** The first sentence, clipped, so a tile stays short. */
export function firstSentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentence = SENTENCE_END.exec(clean)?.[1] ?? clean;
  return sentence.length <= SUMMARY_LIMIT
    ? sentence
    : `${sentence.slice(0, SUMMARY_LIMIT - 1).trimEnd()}…`;
}

/** When an item applies, in Grenada days relative to today. */
export function whenLabel(
  from: Date | null,
  to: Date | null,
  now: Date
): string {
  const today = dayKey(now);
  const started = !from || dayKey(from) <= today;
  const end = to ? DAY.format(to) : null;
  if (started) return end ? `In effect until ${end}` : "In effect";
  const start = DAY.format(from as Date);
  if (!end || end === start) return end ? start : `From ${start}`;
  return `${start} to ${end}`;
}

const levelLabel = (colour: string | null | undefined) =>
  colour ? `${colour[0]?.toUpperCase()}${colour.slice(1)} level` : "Outlook";

/** The detail page of an item: a warning's page or the issued bulletin. */
function hrefFor(item: SectorOutlook["items"][number]): string | null {
  if (item.identifier) return warningHref(item.identifier);
  if (item.product_id) return `/weather/issued/${item.product_id}`;
  return null;
}

/**
 * One tile per sector: the items tagged for it plus every untagged item
 * (which affects everyone), strongest first, as the API sorts them.
 */
export function buildSectorTiles(
  outlook: SectorOutlook,
  now: Date,
  perTile = 3
): SectorTile[] {
  return SECTORS.map(({ value: sector }) => {
    const all: SectorItem[] = outlook.items
      .filter((item) => item.affects_everyone || item.sectors.includes(sector))
      .map((item) => ({
        id: item.identifier ?? item.product_id ?? item.reference,
        title: item.title,
        level: levelLabel(item.colour),
        when: whenLabel(
          item.valid_from ? new Date(item.valid_from) : null,
          item.valid_to ? new Date(item.valid_to) : null,
          now
        ),
        summary: firstSentence(item.impacts),
        href: hrefFor(item),
        everyone: item.affects_everyone,
      }));
    return {
      sector,
      items: all.slice(0, perTile),
      more: Math.max(0, all.length - perTile),
    };
  });
}
