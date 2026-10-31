import type { SectorOutlook } from "@barrelsgd/api-client";
import { SECTORS, type SectorKey } from "@barrelsgd/gms/sectors";
import { warningHref } from "@/lib/warning-detail";

/** Impact levels, mildest first; the bar on a tile runs from green to red. */
export const LEVELS = ["green", "yellow", "orange", "red"] as const;
export type Level = (typeof LEVELS)[number];

const asLevel = (colour: string | null | undefined): Level | null =>
  LEVELS.find((level) => level === colour) ?? null;

/** One alert or warning as a sector tile shows it. */
export interface SectorItem {
  /**
   * A Green "All clear" bulletin: information, not an alert. It has no level
   * and never raises the tile's impact bar.
   */
  allClear: boolean;
  /** Its impact level, or null for an outlook with none. */
  colour: Level | null;
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
  /** The highest level among every item for this sector (shown or not); null when none has a level. */
  peak: Level | null;
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

/**
 * A Green bulletin whose notice type is "All clear" (owner decision, 30 Oct
 * 2026). Only Green qualifies: an "All clear" at another level is still an
 * alert, so it keeps its level.
 */
export function isAllClear(item: SectorOutlook["items"][number]): boolean {
  return item.colour === "green" && item.notice_type === "All clear";
}

const levelLabel = (colour: string | null | undefined) =>
  colour ? `${colour[0]?.toUpperCase()}${colour.slice(1)} level` : "Outlook";

/** The detail page of an item: a warning's page or the issued bulletin. */
export function hrefFor(item: SectorOutlook["items"][number]): string | null {
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
      .map((item) => {
        const allClear = isAllClear(item);
        return {
          id: item.identifier ?? item.product_id ?? item.reference,
          title: item.title,
          level: allClear ? "All clear" : levelLabel(item.colour),
          when: whenLabel(
            item.valid_from ? new Date(item.valid_from) : null,
            item.valid_to ? new Date(item.valid_to) : null,
            now
          ),
          summary: firstSentence(item.impacts),
          href: hrefFor(item),
          everyone: item.affects_everyone,
          allClear,
          // An All clear has no level, so it never sets the tile's peak.
          colour: allClear ? null : asLevel(item.colour),
        };
      });
    const peakIndex = Math.max(
      -1,
      ...all.map((item) => (item.colour ? LEVELS.indexOf(item.colour) : -1))
    );
    return {
      sector,
      peak: peakIndex >= 0 ? (LEVELS[peakIndex] ?? null) : null,
      items: all.slice(0, perTile),
      more: Math.max(0, all.length - perTile),
    };
  });
}
