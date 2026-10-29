import { SECTORS, type SectorKey } from "@barrelsgd/gms/sectors";
import {
  CarIcon,
  HeartPulseIcon,
  PalmtreeIcon,
  PlaneIcon,
  ShipIcon,
  SproutIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { HOME_CARD, HomeSection } from "@/components/home/home-section";
import { StatFigure } from "@/components/home/stat-figure";
import { fetchHomeContent, isSectionHidden, sectionWords } from "@/lib/cms";
import { monthStats } from "@/lib/month-summary";
import { fetchMonthSummary, fetchSectorOutlook } from "@/lib/products";
import { buildSectorTiles, type SectorTile } from "@/lib/sector-outlook";
import { cn } from "@/lib/utils";

/*
 * Owner rule (18 Oct 2026): the public site never shows invented or sample
 * figures. Plan your week shows only GMS alerts and CAP warnings from GMS
 * admin; Grenada in data is live from the MBIA register month summary. Either
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

/**
 * Plan your week: for each sector, the GMS alerts and CAP warnings that apply
 * over the coming week. Everything comes from GMS admin (warnings and alerts
 * tagged by sector; an untagged one shows under every sector as "Affects
 * everyone"). Nothing is invented: an unreachable feed says so, and an empty
 * one says nothing is published, never "no impact". The six sectors are
 * `SECTORS` in `@barrelsgd/gms/sectors` (owner, 28 Oct 2026).
 */
export async function ExploreToday() {
  if (await isSectionHidden("explore-today")) return null;
  const [{ settings }, outlook] = await Promise.all([
    fetchHomeContent(),
    fetchSectorOutlook(),
  ]);
  const words = sectionWords(settings, "explore-today", {
    kicker: "Plan your week",
    title: "What this week means for you",
  });
  const tiles = outlook ? buildSectorTiles(outlook, new Date()) : null;
  return (
    <HomeSection tone="surface" {...words}>
      {!tiles && (
        <p className={cn(HOME_CARD, "mb-3 text-body-sm")} role="status">
          Alerts for the week can&apos;t be loaded right now. See{" "}
          <Link
            className="font-semibold text-gm-blue-ink underline"
            href="/alerts"
          >
            alerts in effect
          </Link>
          .
        </p>
      )}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
        {SECTORS.map(({ value, label }) => {
          const { Icon, href } = SECTOR_TILES[value];
          const tile = tiles?.find((item) => item.sector === value);
          return (
            <li key={value}>
              <section
                aria-label={label}
                className={cn(
                  HOME_CARD,
                  "flex h-full flex-col gap-2 p-3 sm:p-4"
                )}
              >
                <Link
                  className="flex min-w-0 items-center gap-2 hover:underline"
                  href={href as Route}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gm-navy text-gm-lime sm:size-10">
                    <Icon aria-hidden="true" className="size-4 sm:size-5" />
                  </span>
                  <span className="truncate font-semibold text-gm-sky-ink text-label uppercase leading-label tracking-wider">
                    {label}
                  </span>
                </Link>
                {tile ? <SectorItems tile={tile} /> : null}
              </section>
            </li>
          );
        })}
      </ul>
      {outlook && !outlook.complete && (
        <p
          className="mt-2 text-body-sm text-gm-text-secondary leading-body-sm"
          role="status"
        >
          Some alerts could not be read, so these lists may be incomplete. See{" "}
          <Link
            className="font-semibold text-gm-blue-ink underline"
            href="/alerts"
          >
            alerts in effect
          </Link>
          .
        </p>
      )}
    </HomeSection>
  );
}

function SectorItems({ tile }: { tile: SectorTile }) {
  if (tile.items.length === 0) {
    return (
      <p className="text-body-sm text-gm-text-secondary leading-body-sm">
        No alert or warning impacts published for this sector.
      </p>
    );
  }
  return (
    <>
      <ul className="flex flex-col gap-2">
        {tile.items.map((item) => (
          <li className="flex flex-col gap-0.5" key={item.id}>
            <p className="flex flex-wrap items-baseline gap-x-2 font-bold text-body-sm text-gm-heading leading-body-sm">
              {item.href ? (
                <Link className="hover:underline" href={item.href as Route}>
                  {item.title}
                </Link>
              ) : (
                item.title
              )}
              <span className="font-normal text-caption text-gm-text-secondary leading-caption">
                {item.level} · {item.when}
              </span>
            </p>
            {item.everyone && (
              <p className="font-semibold text-gm-sky-ink text-label uppercase leading-label tracking-wider">
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
          className="w-fit font-semibold text-body-sm text-gm-blue-ink leading-body-sm underline"
          href="/alerts"
        >
          {tile.more} more in alerts
        </Link>
      )}
    </>
  );
}

export async function GrenadaInData() {
  if (await isSectionHidden("grenada-in-data")) return null;
  const [{ settings }, summary] = await Promise.all([
    fetchHomeContent(),
    fetchMonthSummary(),
  ]);
  const words = sectionWords(settings, "grenada-in-data", {
    kicker: "This month so far",
    title: "Grenada in data",
  });
  const month = summary ? monthStats(summary) : null;
  return (
    <HomeSection {...words} link={{ href: "/climate", label: "Climate" }}>
      {month ? (
        <ul className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {month.stats.map((stat) => (
            <li
              className={cn(HOME_CARD, "flex flex-col gap-1 p-3 sm:p-4 lg:p-5")}
              key={stat.label}
            >
              <span className="font-bold text-gm-text-secondary text-label uppercase leading-label tracking-wider">
                {stat.label}
              </span>
              <span className="font-bold font-gm-display text-gm-heading text-heading-md tabular-nums leading-heading-md lg:text-gm-numeral">
                <StatFigure stat={stat} />
              </span>
              <span className="text-caption text-gm-text-secondary leading-caption lg:text-body-sm lg:leading-body-sm">
                {stat.value === null ? "Not reported yet" : stat.detail}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p
          className={cn(HOME_CARD, "p-4 text-body-sm text-gm-text-secondary")}
          role="status"
        >
          Month-to-date figures are not available right now.
        </p>
      )}
    </HomeSection>
  );
}
