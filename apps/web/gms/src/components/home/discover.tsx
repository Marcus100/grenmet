import {
  CloudRainIcon,
  LightbulbIcon,
  type LucideIcon,
  MoonIcon,
  TornadoIcon,
} from "lucide-react";
import Link from "next/link";
import { HomeSection } from "@/components/home/home-section";
import {
  contentHref,
  type DiscoverContent,
  fetchHomeContent,
  isSectionHidden,
  quizHref,
} from "@/lib/cms";
import { moonPhase, sunTimes } from "@/lib/sky";

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
  title: string;
  tone: string;
}

/** Tonight's sun and moon, calculated; an editor's sky note leads if set. */
export function skyCard(now: Date, note: DiscoverContent["skyNote"]): Card {
  const today = GRENADA_DAY.format(now);
  const { sunrise, sunset } = sunTimes(today);
  // The moon as it will look this evening, 20:00 AST.
  const moon = moonPhase(new Date(`${today}T20:00:00-04:00`));
  const lit = `${Math.round(moon.illumination * 100)}% lit`;
  return {
    key: "sky",
    kicker: "Tonight",
    title: note?.title ?? `${moon.name}, ${lit}`,
    detail:
      note?.note ??
      `Sunrise ${TIME.format(sunrise)} · sunset ${TIME.format(sunset)}`,
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
          detail: `${fact.fact} Source: ${fact.source}.`,
          href: fact.sourceUrl,
          Icon: LightbulbIcon,
          tone: "bg-gm-sky-mid text-gm-text-inverse",
        }
      : null,
  };
}

const CARD =
  "flex h-full flex-col overflow-hidden rounded-gm-card border border-gm-border bg-background";

function CardBody({ card }: { card: Card }) {
  const { Icon } = card;
  return (
    <>
      <span
        className={`flex aspect-16/7 items-center justify-center ${card.tone}`}
      >
        <Icon aria-hidden="true" className="size-12" strokeWidth={1.4} />
      </span>
      <span className="flex flex-col gap-1 p-4">
        <span className="font-bold text-gm-sky-ink text-label uppercase leading-label tracking-wider">
          {card.kicker}
        </span>
        <span className="font-bold text-body-base text-gm-heading leading-body-base">
          {card.title}
        </span>
        <span className="text-body-sm text-gm-text-secondary leading-body-sm">
          {card.detail}
        </span>
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
      <Link className={`${CARD} hover:border-gm-blue-ink`} href={card.href}>
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
 * Sky, history and a little fun: at most four cards, in the order editors
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
  return (
    <HomeSection kicker="Discover" title="Sky, history and a little fun">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <li key={card.key}>
            <CardLink card={card} />
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}
