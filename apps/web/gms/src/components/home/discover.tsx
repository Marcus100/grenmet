import {
  CloudRainIcon,
  LightbulbIcon,
  type LucideIcon,
  MoonIcon,
  TornadoIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { HomeSection } from "@/components/home/home-section";
import { clock12 } from "@/lib/clock";
import {
  contentHref,
  type DiscoverContent,
  fetchHomeContent,
  isSectionHidden,
  quizHref,
  sectionWords,
} from "@/lib/cms";
import { sunTimes } from "@/lib/sky";

/** Shown in place of the moon phase until the almanac data exists (owner, 5 Nov 2026). */
export const MOON_COMING_SOON = "Moon and tides coming soon";

const TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Grenada",
  hour: "2-digit",
  minute: "2-digit",
});
const GRENADA_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Grenada",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface Card {
  detail: string;
  href: string | null;
  Icon: LucideIcon;
  key: string;
  kicker: string;
  /** Where a fact comes from, shown once under the text (owner, 10 Nov 2026). */
  source?: string;
  title: string;
  tone: string;
}

/**
 * Tonight's sun, calculated; an editor's sky note leads if set. The moon's phase
 * is not shown until the almanac database holds its figures (owner, 5 Nov
 * 2026), so the tile says "Moon and tides coming soon" and keeps the sun times.
 */
export function skyCard(now: Date, note: DiscoverContent["skyNote"]): Card {
  const today = GRENADA_DAY.format(now);
  const { sunrise, sunset } = sunTimes(today);
  return {
    key: "sky",
    kicker: "Tonight",
    title: note?.title ?? MOON_COMING_SOON,
    detail:
      note?.note ??
      `Sunrise ${clock12(TIME.format(sunrise))} · sunset ${clock12(TIME.format(sunset))}`,
    href: "/weather/sun-and-sky",
    Icon: MoonIcon,
    tone: "bg-gm-navy text-gm-lime",
  };
}

function cmsCards(
  discover: DiscoverContent | null
): Record<string, Card | null> {
  const entry = discover?.onThisDay;
  const quiz = discover?.quiz;
  const fact = discover?.fact;
  return {
    "on-this-day": entry
      ? {
          key: "on-this-day",
          kicker: `On this day · ${entry.day} ${MONTHS[entry.month - 1]} ${entry.year}`,
          title: entry.title,
          detail: entry.whatHappened,
          href: entry.story
            ? contentHref({ collection: "stories", slug: entry.story.slug })
            : "/explore/history/hurricanes",
          Icon: TornadoIcon,
          tone: "bg-gm-sky-deep text-gm-text-inverse",
        }
      : null,
    quiz: quiz
      ? {
          key: "quiz",
          kicker: "Weather quiz",
          title: quiz.title,
          detail: `${quiz.questionCount} questions`,
          href: quizHref(quiz.slug),
          Icon: CloudRainIcon,
          tone: "bg-gm-lime text-gm-navy",
        }
      : null,
    fact: fact
      ? {
          key: "fact",
          kicker: "Did you know",
          title: fact.title,
          detail: fact.fact,
          source: fact.source,
          href: fact.sourceUrl,
          Icon: LightbulbIcon,
          tone: "bg-gm-sky-mid text-gm-text-inverse",
        }
      : null,
  };
}

const CARD =
  "flex h-full w-full flex-col overflow-hidden rounded-gm-card border border-gm-border bg-background";

function CardBody({ card }: { card: Card }) {
  const { Icon } = card;
  return (
    <>
      <span
        className={`flex aspect-16/7 items-center justify-center ${card.tone}`}
      >
        <Icon aria-hidden="true" className="size-12" strokeWidth={1.4} />
      </span>
      <span className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-gm-sky-ink text-label leading-label font-bold tracking-wider uppercase">
          {card.kicker}
        </span>
        <span className="text-body-base text-gm-heading leading-body-base font-bold">
          {card.title}
        </span>
        {/* Four lines at most, so the row's cards stay one size (owner, 10
            Nov 2026); editors keep facts short, the field allows 200 characters. */}
        <span className="text-body-sm text-gm-text-secondary leading-body-sm line-clamp-4">
          {card.detail}
        </span>
        {card.source && (
          <span className="text-caption text-gm-text-muted leading-caption mt-auto pt-1">
            Source: {card.source}
          </span>
        )}
      </span>
    </>
  );
}

/** Site pages use Link, sources open as plain links, and no link is a card. */
function CardLink({ card }: { card: Card }) {
  if (!card.href)
    return (
      <div className={CARD}>
        <CardBody card={card} />
      </div>
    );
  if (card.href.startsWith("/"))
    return (
      <Link
        className={`${CARD} hover:border-gm-blue-ink`}
        href={card.href as Route}
      >
        <CardBody card={card} />
      </Link>
    );
  return (
    <a className={`${CARD} hover:border-gm-blue-ink`} href={card.href}>
      <CardBody card={card} />
    </a>
  );
}

/**
 * Discover (fun, facts and history): at most four cards, in the order editors
 * choose. Tonight's sky is calculated; the rest appear only when published.
 */
export async function Discover({ now = new Date() }: { now?: Date } = {}) {
  if (await isSectionHidden("discover")) return null;
  const { discover, settings } = await fetchHomeContent();
  const fromCms = cmsCards(discover);
  const cards = settings.discoverCards
    .map((key) =>
      key === "sky" ? skyCard(now, discover?.skyNote ?? null) : fromCms[key]
    )
    .filter((card): card is Card => Boolean(card))
    .slice(0, 4);
  if (cards.length === 0) return null;
  const words = sectionWords(settings, "discover", {
    kicker: "Fun, facts and history",
    title: "Discover",
  });
  return (
    <HomeSection tone="surface" {...words}>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <li className="flex" key={card.key}>
            <CardLink card={card} />
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}
