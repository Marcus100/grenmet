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
  /** "What to do": the first sentence of the alert's response text, or "" when it has none. */
  advice: string;
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
const AS_OF = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Grenada",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Grenada",
});
const SENTENCE_END = /^(.+?[.!?])(\s|$)/u;
const SUMMARY_LIMIT = 140;

const dayKey = (date: Date) => DAY_KEY.format(date);

/** When the outlook was read, in Grenada time ("Wed 28 Oct, 11:00 AST"), so a stale feed does not read as current. */
export function formatOutlookAsOf(iso: string): string {
  return `${AS_OF.format(new Date(iso))} AST`;
}

/** The first sentence, clipped, so a tile stays short. */
export function firstSentence(text: string): string {
  const clean = text.replace(/\s+/gu, " ").trim();
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
 * alert, so it keeps its level. Takes a sector outlook item, or a forecast's
 * advisories snapshot item mapped to these two fields.
 */
export function isAllClear(item: {
  colour?: string | null;
  notice_type?: string | null;
}): boolean {
  // Compared trimmed: older saved forecast snapshots may carry " All clear".
  return item.colour === "green" && item.notice_type?.trim() === "All clear";
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
          advice: item.response ? firstSentence(item.response) : "",
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

const LEVEL_NAME: Record<Level, string> = {
  green: "Green",
  yellow: "Yellow",
  orange: "Orange",
  red: "Red",
};

/** "Marine", "Marine and Health", "Marine, Health and Aviation". */
function joinLabels(labels: string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

/**
 * The compact card's bold line and short text, written from the week's
 * published alerts and warnings only (owner, 8 Nov 2026): the highest level and
 * the sectors at it, then the first item there and when it applies. With
 * nothing published it says so; it never invents an all-clear.
 */
export function weekSummary(
  tiles: SectorTile[],
  complete = true
): {
  headline: string;
  text: string;
} {
  const withItems = tiles.filter((tile) => tile.items.length > 0);
  if (withItems.length === 0) {
    // A partly read feed never reads as an all-clear.
    return complete
      ? {
          headline: "No alerts or warnings this week",
          text: "Nothing is published for any sector right now.",
        }
      : { headline: "This week's alerts and warnings", text: "" };
  }
  const label = (tile: SectorTile) =>
    SECTORS.find(({ value }) => value === tile.sector)?.label ?? tile.sector;
  const peakIndex = Math.max(
    -1,
    ...withItems.map((tile) => (tile.peak ? LEVELS.indexOf(tile.peak) : -1))
  );
  const peak = peakIndex >= 0 ? LEVELS[peakIndex] : undefined;
  const top = peak ? withItems.filter((tile) => tile.peak === peak) : withItems;
  const sectors =
    top.length === tiles.length ? "all sectors" : joinLabels(top.map(label));
  // The line under the headline is an item at the headline's level.
  const first = peak
    ? top.flatMap((tile) => tile.items).find((item) => item.colour === peak)
    : top[0]?.items[0];
  return {
    headline: peak
      ? `${LEVEL_NAME[peak]} level for ${sectors}`
      : `Outlooks for ${sectors}`,
    text: first ? `${first.title} · ${first.when}` : "",
  };
}
