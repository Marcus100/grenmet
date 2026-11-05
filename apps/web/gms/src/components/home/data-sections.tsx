import { SECTORS, type SectorKey } from "@barrelsgd/gms/sectors";
import {
  CarIcon,
  DropletIcon,
  HeartPulseIcon,
  type LucideIcon,
  PalmtreeIcon,
  PlaneIcon,
  ShipIcon,
  SproutIcon,
  SunIcon,
  ThermometerIcon,
  WindIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import {
  DESK_CARD_ITEM,
  HOME_CARD,
  HomeSection,
} from "@/components/home/home-section";
import { StatFigure } from "@/components/home/stat-figure";
import { fetchHomeContent, isSectionHidden, sectionWords } from "@/lib/cms";
import { dataMonth, type MonthGroupKey, monthStats } from "@/lib/month-summary";
import { fetchMonthSummary, fetchSectorOutlook } from "@/lib/products";
import {
  buildSectorTiles,
  formatOutlookAsOf,
  LEVELS,
  type Level,
  type SectorTile,
} from "@/lib/sector-outlook";
import { cn } from "@/lib/utils";

/*
 * Owner rule (18 Oct 2026): the public site never shows invented or sample
 * figures. The sector card ("Plan your week") shows only GMS alerts and CAP
 * warnings from GMS admin; Grenada in data is live from the MBIA register month summary. Either
 * says so when its feed is unavailable, never a sample or an all-clear.
 */

/** The sector tiles: icon and the service page each one links to. */
const SECTOR_TILES: Record<
  SectorKey,
  { Icon: typeof PalmtreeIcon; href: string }
> = {
  tourism: { Icon: PalmtreeIcon, href: "/services/tourism" },
  marine: { Icon: ShipIcon, href: "/marine" },
  aviation: { Icon: PlaneIcon, href: "/services/aviation" },
  agriculture: { Icon: SproutIcon, href: "/services/agriculture" },
  health: { Icon: HeartPulseIcon, href: "/services/health" },
  "roads-transport": { Icon: CarIcon, href: "/services/roads-transport" },
};

/** The sector card's kicker and title; the page repeats them when the desk is hidden. */
export const SECTOR_CARD_WORDS = {
  kicker: "Plan your week",
  title: "What it means for you",
} as const;

/**
 * "What it means for you", a card in the From the Desk row (homepage v2, owner
 * 1 Nov 2026): for each sector, the GMS alerts and CAP warnings that apply over
 * the coming week. Everything comes from GMS admin (warnings and alerts tagged
 * by sector; an untagged one shows under every sector as "Affects everyone").
 * Nothing is invented: an unreachable feed says so, and an empty one says
 * nothing is published, never "no impact". The six sectors are `SECTORS` in
 * `@barrelsgd/gms/sectors`. Editors can still hide it with the
 * `explore-today` switch. With `header: false` the card drops its own kicker
 * and title (the page already shows them as its section heading) and keeps an
 * accessible name instead.
 */
export async function SectorDeskCard({
  header = true,
}: {
  header?: boolean;
} = {}) {
  if (await isSectionHidden("explore-today")) return null;
  const outlook = await fetchSectorOutlook();
  const tiles = outlook ? buildSectorTiles(outlook, new Date()) : null;
  // Said once for the whole week instead of six times, once per tile.
  const quiet = tiles?.every((tile) => tile.items.length === 0) ?? false;
  return (
    <li className={DESK_CARD_ITEM}>
      {/* The heading id is fixed: this card renders once per page. */}
      <article
        aria-label={header ? undefined : SECTOR_CARD_WORDS.title}
        aria-labelledby={header ? "sector-card-title" : undefined}
        className={cn(HOME_CARD, "flex h-full flex-col gap-3")}
      >
        {header && (
          <header className="flex flex-col gap-1">
            <span className="bg-gm-surface-panel text-gm-heading text-label leading-label w-fit rounded-full px-2.5 py-0.5 font-bold tracking-wider uppercase">
              {SECTOR_CARD_WORDS.kicker}
            </span>
            <h3
              className="text-gm-heading text-heading-sm leading-heading-sm font-bold text-balance"
              id="sector-card-title"
            >
              {SECTOR_CARD_WORDS.title}
            </h3>
          </header>
        )}
        {/* The card's notices sit together in one status region. */}
        {(!tiles || quiet || (outlook && !outlook.complete)) && (
          <div className="flex flex-col gap-2" role="status">
            {!tiles && (
              <p className="text-body-sm leading-body-sm">
                Alerts for the week can&apos;t be loaded right now. See{" "}
                <Link
                  className="text-gm-blue-ink font-semibold underline"
                  href="/alerts"
                >
                  alerts in effect
                </Link>
                .
              </p>
            )}
            {quiet && (
              <p className="text-body-base text-gm-text-secondary leading-body-base">
                No alerts or warnings are published for any sector this week.
              </p>
            )}
            {outlook && !outlook.complete && (
              <p className="text-body-sm text-gm-text-secondary leading-body-sm">
                Some alerts could not be read, so these lists may be incomplete.
                See{" "}
                <Link
                  className="text-gm-blue-ink font-semibold underline"
                  href="/alerts"
                >
                  alerts in effect
                </Link>
                .
              </p>
            )}
          </div>
        )}
        <ul className="divide-gm-border flex flex-col divide-y">
          {SECTORS.map(({ value, label }) => {
            const { Icon, href } = SECTOR_TILES[value];
            const tile = tiles?.find((item) => item.sector === value);
            return (
              <li className="py-2.5" key={value}>
                <section aria-label={label} className="flex flex-col gap-1.5">
                  <Link
                    className="flex min-w-0 items-center gap-2 hover:underline"
                    href={href as Route}
                  >
                    <span className="bg-gm-navy text-gm-lime flex size-8 shrink-0 items-center justify-center rounded-lg">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="text-gm-sky-ink text-label leading-label font-semibold tracking-wider uppercase">
                      {label}
                    </span>
                  </Link>
                  {tile ? <ImpactBar peak={tile.peak} /> : null}
                  {tile ? <SectorItems tile={tile} /> : null}
                </section>
              </li>
            );
          })}
        </ul>
        {outlook && (
          <p className="text-body-sm text-gm-text-secondary leading-body-sm mt-auto">
            Updated {formatOutlookAsOf(outlook.as_of)}
          </p>
        )}
      </article>
    </li>
  );
}

const LEVEL_WORD: Record<Level, string> = {
  green: "Green",
  yellow: "Yellow",
  orange: "Orange",
  red: "Red",
};

/** The level's colour, from the shared risk scale. */
const LEVEL_COLOUR: Record<Level, string> = {
  green: "var(--gm-risk-green)",
  yellow: "var(--gm-risk-yellow)",
  orange: "var(--gm-risk-amber)",
  red: "var(--gm-risk-red)",
};

/** Sixteen blocks, one per cell of the 4 by 4 impact-based forecast matrix; each level fills a quarter. */
const BLOCKS = 16;
const BLOCK_KEYS = Array.from({ length: BLOCKS }, (_, i) => `block-${i}`);

/**
 * A level meter like a progress bar (owner, 29 Oct 2026): green fills a
 * quarter, yellow half, orange three quarters, red all of it, every filled
 * block in that level's colour. The level is the highest among the GMS alerts
 * and CAP warnings for the sector this week. With nothing published every
 * block stays grey: nothing is invented. The level is also written out, never
 * colour alone, and the meter is announced as a value out of four.
 */
function ImpactBar({ peak }: { peak: Level | null }) {
  const step = peak ? LEVELS.indexOf(peak) + 1 : 0;
  const filled = (step * BLOCKS) / LEVELS.length;
  return (
    <div className="flex flex-col gap-1">
      <meter
        aria-label={
          peak
            ? `Impact level ${LEVEL_WORD[peak]}, ${step} of 4`
            : "No impact level published"
        }
        className="sr-only"
        max={LEVELS.length}
        min={0}
        value={step}
      >
        {step} of {LEVELS.length}
      </meter>
      <div aria-hidden="true" className="flex gap-0.5">
        {BLOCK_KEYS.map((key, i) => (
          <span
            className={cn(
              "h-3 flex-1 rounded-[3px]",
              i < filled ? "" : "bg-gm-border"
            )}
            key={key}
            style={
              i < filled && peak
                ? { background: LEVEL_COLOUR[peak] }
                : undefined
            }
          />
        ))}
      </div>
      {/* With nothing published, the sentence under the meter already says so. */}
      {peak && (
        <p className="text-caption text-gm-text-secondary leading-caption">
          Highest this week: {LEVEL_WORD[peak]}
        </p>
      )}
    </div>
  );
}

function SectorItems({ tile }: { tile: SectorTile }) {
  if (tile.items.length === 0) {
    return (
      <p className="text-body-sm text-gm-text-secondary leading-body-sm">
        Nothing this week
      </p>
    );
  }
  return (
    <>
      <ul className="flex flex-col gap-2">
        {tile.items.map((item) => (
          <li className="flex flex-col gap-0.5" key={item.id}>
            <p className="text-body-sm text-gm-heading leading-body-sm flex flex-wrap items-baseline gap-x-2 font-bold">
              {item.href ? (
                <Link className="hover:underline" href={item.href as Route}>
                  {item.title}
                </Link>
              ) : (
                item.title
              )}
              <span className="text-caption text-gm-text-secondary leading-caption font-normal">
                {item.level} · {item.when}
              </span>
            </p>
            {item.everyone && (
              <p className="text-gm-sky-ink text-label leading-label font-semibold tracking-wider uppercase">
                Affects everyone
              </p>
            )}
            {item.summary && (
              <p className="text-body-sm leading-body-sm">{item.summary}</p>
            )}
          </li>
        ))}
      </ul>
      {tile.more > 0 && (
        <Link
          className="text-body-sm text-gm-blue-ink leading-body-sm w-fit font-semibold underline"
          href="/alerts"
        >
          {tile.more} more in alerts
        </Link>
      )}
    </>
  );
}

const GROUP_ICONS: Record<MonthGroupKey, LucideIcon> = {
  rain: DropletIcon,
  temperature: ThermometerIcon,
  wind: WindIcon,
  dry: SunIcon,
};

export async function GrenadaInData() {
  if (await isSectionHidden("grenada-in-data")) return null;
  const shown = dataMonth();
  const [{ settings }, summary] = await Promise.all([
    fetchHomeContent(),
    fetchMonthSummary(shown.month),
  ]);
  const words = sectionWords(settings, "grenada-in-data", {
    kicker: shown.label,
    title: "Grenada in data",
  });
  const month = summary ? monthStats(summary, shown.previous) : null;
  return (
    <HomeSection
      tone="surface"
      {...words}
      link={{ href: "/climate", label: "Climate" }}
    >
      {month ? (
        <ul className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {month.groups.map((group) => {
            const Icon = GROUP_ICONS[group.key];
            return (
              <li
                className={cn(
                  HOME_CARD,
                  "flex flex-col gap-3 p-3 sm:p-4 lg:p-5"
                )}
                key={group.key}
              >
                <h3 className="text-body text-gm-heading leading-body flex items-center gap-2 font-bold">
                  <span
                    aria-hidden="true"
                    className="bg-gm-navy text-gm-lime flex size-8 shrink-0 items-center justify-center rounded-lg"
                  >
                    <Icon className="size-4" />
                  </span>
                  {group.name}
                </h3>
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {group.stats.map((stat) => (
                    <div className="flex flex-col gap-0.5" key={stat.label}>
                      <dt className="text-gm-text-secondary text-label leading-label font-bold tracking-wider uppercase">
                        {stat.label}
                      </dt>
                      <dd className="font-gm-display text-gm-heading text-heading-md leading-heading-md font-bold tabular-nums">
                        <StatFigure stat={stat} />
                      </dd>
                      <dd className="text-caption text-gm-text-secondary leading-caption lg:text-body-sm lg:leading-body-sm">
                        {stat.value === null ? "Not reported yet" : stat.detail}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ul>
      ) : (
        <p
          className={cn(HOME_CARD, "text-body-sm text-gm-text-secondary p-4")}
          role="status"
        >
          Figures for {shown.label.replace(" at MBIA", "")} are not available
          right now.
        </p>
      )}
    </HomeSection>
  );
}
