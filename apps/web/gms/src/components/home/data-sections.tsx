import { SECTORS, type SectorKey } from "@barrelsgd/gms/sectors";
import {
  ArrowRightIcon,
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
import { CardPictureArea } from "@/components/home/card-picture";
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
  weekSummary,
} from "@/lib/sector-outlook";
import { STOCK_PICTURES } from "@/lib/stock-pictures";
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

/** The card's name and subtitle; the full page uses the same words. */
export const SECTOR_CARD_WORDS = {
  title: "Plan your week",
  subtitle: "What it means for you",
} as const;

/**
 * A sector tile's state for screen readers and its word under the icon. A
 * level is written under the icon too, never colour alone. A quiet sector
 * shows no word: the card's sentence already says so, and six "None" labels
 * read as missing data (owner, 10 Nov 2026). An unread feed shows a dash.
 */
export function sectorStatus(
  peak: Level | null | undefined,
  read: boolean
): { state: string; word: string } {
  if (peak)
    return { state: `${LEVEL_WORD[peak]} level`, word: LEVEL_WORD[peak] };
  return read
    ? { state: "nothing this week", word: "" }
    : { state: "not available", word: "—" };
}

/** The full week page, linked from the card. */
export const PLAN_YOUR_WEEK_HREF = "/plan-your-week";

/** Loads the week's tiles; null when the feed cannot be read. */
async function loadWeek() {
  const outlook = await fetchSectorOutlook();
  const tiles = outlook ? buildSectorTiles(outlook, new Date()) : null;
  return { outlook, tiles };
}

type Week = Awaited<ReturnType<typeof loadWeek>>;

/** The feed notices, said once for the whole week; never an invented all-clear. */
function WeekNotices({
  outlook,
  quiet = false,
  tiles,
}: Week & { quiet?: boolean }) {
  if (tiles && !quiet && outlook?.complete !== false) return null;
  return (
    <div className="flex flex-col gap-2" role="status">
      {quiet && (
        <p className="text-body-base text-gm-text-secondary leading-body-base">
          No alerts or warnings are published for any sector this week.
        </p>
      )}
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
      {outlook && !outlook.complete && (
        <p className="text-body-sm text-gm-text-secondary leading-body-sm">
          Some alerts could not be read, so these lists may be incomplete. See{" "}
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
  );
}

/**
 * "Plan your week", a card in the From the Desk row shaped like the desk posts
 * (owner, 8 Nov 2026, after the Yr "Latest from the meteorologists" cards): a
 * GMS byline with the update time, one bold line and a short text written from
 * the week's GMS alerts and CAP warnings, the picture area, one row of the six
 * sector icons coloured by their highest level (all six always shown), and a
 * link to the full week. Everything comes from GMS admin; an unreachable feed
 * says so. Editors can hide it with the `explore-today` switch. With
 * `header: false` the byline goes (the page section already names it).
 */
export async function SectorDeskCard({
  header = true,
}: {
  header?: boolean;
} = {}) {
  if (await isSectionHidden("explore-today")) return null;
  const week = await loadWeek();
  const { outlook, tiles } = week;
  const summary = tiles
    ? weekSummary(tiles, outlook?.complete !== false)
    : null;
  return (
    <li className={DESK_CARD_ITEM}>
      {/* The heading id is fixed: this card renders once per page. */}
      <article
        aria-labelledby="sector-card-title"
        className={cn(HOME_CARD, "flex h-full flex-col gap-3")}
      >
        {header && (
          <header className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="bg-gm-sky-ink text-body-sm text-gm-text-inverse leading-body-sm flex size-10 shrink-0 items-center justify-center rounded-full font-bold"
            >
              GMS
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-body text-gm-heading leading-body font-bold">
                {SECTOR_CARD_WORDS.title}
              </span>
              <span className="text-body-sm text-gm-text-secondary leading-body-sm">
                {SECTOR_CARD_WORDS.subtitle}
                {outlook && <> · Updated {formatOutlookAsOf(outlook.as_of)}</>}
              </span>
            </span>
          </header>
        )}
        <h3
          className="text-gm-heading text-heading-sm leading-heading-sm font-bold text-balance"
          id="sector-card-title"
        >
          <Link className="hover:underline" href={PLAN_YOUR_WEEK_HREF as Route}>
            {summary?.headline ?? "This week's alerts and warnings"}
          </Link>
        </h3>
        {summary?.text && (
          <p className="text-body-base leading-body-base">{summary.text}</p>
        )}
        <WeekNotices {...week} />
        {/* No product sits behind the week: a standard Grenada photo (owner, 10 Nov 2026). */}
        <CardPictureArea picture={STOCK_PICTURES.week} />
        <ul aria-label="Sectors this week" className="grid grid-cols-6 gap-1.5">
          {SECTORS.map(({ value, label }) => {
            const { Icon } = SECTOR_TILES[value];
            const peak = tiles?.find((tile) => tile.sector === value)?.peak;
            const { state, word } = sectorStatus(peak, Boolean(tiles));
            return (
              <li key={value}>
                <Link
                  aria-label={`${label}: ${state}`}
                  className="flex flex-col items-center gap-1 hover:underline"
                  href={`${PLAN_YOUR_WEEK_HREF}#${value}` as Route}
                  title={`${label}: ${state}`}
                >
                  <span
                    className={cn(
                      "flex aspect-square w-full items-center justify-center rounded-lg",
                      !peak && "bg-gm-navy text-gm-lime"
                    )}
                    style={
                      peak
                        ? {
                            background: LEVEL_COLOUR[peak],
                            color: LEVEL_ICON[peak],
                          }
                        : undefined
                    }
                  >
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  {word && (
                    <span
                      aria-hidden="true"
                      className="text-caption text-gm-text-secondary leading-caption"
                    >
                      {word}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <Link
          className="text-body text-gm-blue-ink leading-body mt-auto flex w-fit items-center gap-1 font-semibold hover:underline"
          href={PLAN_YOUR_WEEK_HREF as Route}
        >
          See the whole week
          <ArrowRightIcon aria-hidden="true" className="size-4" />
        </Link>
      </article>
    </li>
  );
}

/**
 * The full week on its own page: every sector with its meter, its alerts and
 * warnings, when they apply and what to do. Each sector has an anchor the
 * card's icons link to.
 */
export async function SectorWeek() {
  const week = await loadWeek();
  const { outlook, tiles } = week;
  const quiet = tiles?.every((tile) => tile.items.length === 0) ?? false;
  return (
    <div className="flex flex-col gap-4">
      <WeekNotices {...week} quiet={quiet} />
      <ul className="divide-gm-border flex flex-col divide-y">
        {SECTORS.map(({ value, label }) => {
          const { Icon, href } = SECTOR_TILES[value];
          const tile = tiles?.find((item) => item.sector === value);
          return (
            <li className="scroll-mt-24 py-4" id={value} key={value}>
              <section aria-label={label} className="flex flex-col gap-2">
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
        <p className="text-body-sm text-gm-text-secondary leading-body-sm">
          Updated {formatOutlookAsOf(outlook.as_of)}
        </p>
      )}
    </div>
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

/** Icon colour on each level: navy, except white on red, which navy fails (2.8:1). */
const LEVEL_ICON: Record<Level, string> = {
  green: "var(--gm-navy)",
  yellow: "var(--gm-navy)",
  orange: "var(--gm-navy)",
  red: "var(--gm-text-inverse)",
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
            {item.advice && (
              <p className="text-body-sm leading-body-sm">
                <span className="font-semibold">What to do:</span> {item.advice}
              </p>
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
