import { isProductKind, productTitle } from "@barrelsgd/gms/products";
import {
  ArrowRightIcon,
  BellIcon,
  ChevronRightIcon,
  SmartphoneIcon,
} from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { HOME_CARD, HomeSection } from "@/components/home/home-section";
import { clock12 } from "@/lib/clock";
import {
  contentHref,
  fetchHomeContent,
  isOptimizableImage,
  isSectionHidden,
  type PublishedContent,
  questionHref,
  sectionWords,
} from "@/lib/cms";
import { contentToArticle } from "@/lib/editorial";
import { cn } from "@/lib/utils";

const SHORT_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Grenada",
  day: "numeric",
  month: "short",
});

/** The same bordered notice as "Grenada in data": one line, aligned to the heading. */
const NOTICE = cn(HOME_CARD, "text-body-sm text-gm-text-secondary p-4");

/** Unavailable, empty or content — the three states every CMS feed has. */
function FeedState({
  children,
  count,
  empty,
  unavailable,
}: {
  children: React.ReactNode;
  count: number;
  empty: string;
  /** Set when the feed could not be reached; never shown as "none". */
  unavailable: string | false;
}) {
  if (unavailable) {
    return (
      <p className={NOTICE} role="status">
        {unavailable}
      </p>
    );
  }
  if (count === 0) {
    return <p className={NOTICE}>{empty}</p>;
  }
  return children;
}

const CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Grenada",
  hour: "2-digit",
  minute: "2-digit",
});
const GRENADA_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Grenada",
});

/** "Today at 8:36 a.m.", "Yesterday at 7:00 p.m." or "27 Oct at 7:00 p.m.", Grenada time. */
export function postedLabel(iso: string, now = new Date()): string {
  const when = new Date(iso);
  const day = GRENADA_DAY.format(when);
  const yesterday = new Date(now.getTime() - 86_400_000);
  let prefix = SHORT_DATE.format(when);
  if (day === GRENADA_DAY.format(now)) prefix = "Today";
  else if (day === GRENADA_DAY.format(yesterday)) prefix = "Yesterday";
  return `${prefix} at ${clock12(CLOCK.format(when))}`;
}

const NAME_SEPARATORS = /[\s._-]+/u;

/** "Eugine Whint" gives "EW"; one word gives its first two letters; no name gives "GMS". */
export function avatarInitials(name: string | null | undefined): string {
  const words = (name ?? "").split(NAME_SEPARATORS).filter(Boolean);
  if (words.length === 0) return "GMS";
  const letters =
    words.length > 1
      ? `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`
      : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
}

/**
 * One desk post as a card: who posted it and when, the words, its picture (a
 * chart or map) and a link to the article, which carries any linked product.
 */
function DeskPostCard({ item }: { item: PublishedContent }) {
  const posted = item.publishedAt ?? item.updatedAt;
  // `relative` keeps the link's screen-reader text inside the scrolling row;
  // without it that hidden text widens the whole page on phones.
  return (
    <li className="relative w-[85%] shrink-0 snap-start sm:w-[22rem] lg:w-[24rem]">
      <article className={cn(HOME_CARD, "flex h-full flex-col gap-3")}>
        <header className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="bg-gm-sky-ink text-body-sm text-gm-text-inverse leading-body-sm flex size-10 shrink-0 items-center justify-center rounded-full font-bold"
          >
            {avatarInitials(item.authorName)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-body text-gm-heading leading-body font-bold">
              {item.authorName ?? "The forecasters"}
            </span>
            <time
              className="text-body-sm text-gm-text-secondary leading-body-sm"
              dateTime={posted}
            >
              {postedLabel(posted)}
            </time>
          </span>
        </header>
        <h3 className="text-gm-heading text-heading-sm leading-heading-sm font-bold text-balance">
          <Link className="hover:underline" href={contentHref(item) as Route}>
            {item.title}
          </Link>
        </h3>
        {item.summary && (
          <p className="text-body-base leading-body-base">{item.summary}</p>
        )}
        {item.imageUrl && (
          <span className="bg-gm-surface-panel relative aspect-[4/3] overflow-hidden rounded-lg">
            <Image
              alt={item.imageAlt ?? ""}
              className="object-cover"
              fill
              sizes="(min-width: 640px) 24rem, 85vw"
              src={item.imageUrl}
              unoptimized={!isOptimizableImage(item.imageUrl)}
            />
          </span>
        )}
        <Link
          className="text-body text-gm-blue-ink leading-body mt-auto flex w-fit items-center gap-1 font-semibold hover:underline"
          href={contentHref(item) as Route}
        >
          Read the article
          <span className="sr-only">: {item.title}</span>
          <ArrowRightIcon aria-hidden="true" className="size-4" />
        </Link>
      </article>
    </li>
  );
}

/**
 * From the Desk: the forecast office blogging about what it issues, newest
 * first as a row of post cards that scrolls sideways. Posts are
 * CMS content; any product a post attaches is read live from FastAPI, so the
 * section never shows a forecast itself.
 */
export async function ForecastDesk() {
  if (await isSectionHidden("desk")) return null;
  const { deskUpdates: updates, settings } = await fetchHomeContent();
  const words = sectionWords(settings, "desk", {
    kicker: "GMS forecast desk",
    title: "From the Desk",
  });
  return (
    <HomeSection
      {...words}
      link={{ href: "/explore/updates", label: "See more" }}
    >
      <FeedState
        count={updates.articles.length}
        empty="No desk updates are published yet."
        unavailable={
          updates.status === "unavailable" &&
          "Desk updates cannot be retrieved right now."
        }
      >
        <ul
          aria-label="Latest desk posts"
          className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 max-lg:[scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 xl:-mx-8 xl:scroll-px-8 xl:px-8 max-lg:[&::-webkit-scrollbar]:hidden"
        >
          {updates.articles.slice(0, 8).map((item) => (
            <DeskPostCard item={item} key={item.id} />
          ))}
        </ul>
      </FeedState>
    </HomeSection>
  );
}

/** Editorial stories: one lead, the rest in a side column. */
export async function Stories() {
  if (await isSectionHidden("stories")) return null;
  const { stories: result, settings } = await fetchHomeContent();
  const words = sectionWords(settings, "stories", {
    kicker: "Earth & Weather",
    title: "Weather news",
  });
  const [lead, ...rest] = result.articles.map(contentToArticle);
  return (
    <HomeSection
      tone="surface"
      {...words}
      link={{ href: "/explore/news", label: "More stories" }}
    >
      <FeedState
        count={lead ? 1 : 0}
        empty="No stories are published yet."
        unavailable={
          result.status === "unavailable" &&
          "Stories cannot be retrieved right now."
        }
      >
        {lead && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Link
              className="group flex flex-col gap-2"
              href={lead.href as Route}
            >
              <span className="rounded-gm-card bg-gm-surface-panel relative aspect-video overflow-hidden">
                <Image
                  alt=""
                  className="object-cover"
                  fill
                  sizes="(min-width: 1024px) 60vw, 100vw"
                  src={lead.imageUrl}
                  unoptimized={!isOptimizableImage(lead.imageUrl)}
                />
              </span>
              <span className="text-gm-heading text-heading-base leading-heading-base font-bold text-balance group-hover:underline">
                {lead.title}
              </span>
              <span className="text-body-base text-gm-text-secondary leading-body-base">
                {lead.summary}
              </span>
              <span className="text-body-sm text-gm-text-muted leading-body-sm">
                GMS · {lead.published}
              </span>
            </Link>
            <ul className="flex flex-col gap-4">
              {rest.slice(0, 4).map((story) => (
                <li key={story.id}>
                  <Link
                    className="group grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3"
                    href={story.href as Route}
                  >
                    <span className="bg-gm-surface-panel relative aspect-video overflow-hidden rounded-lg">
                      <Image
                        alt=""
                        className="object-cover"
                        fill
                        sizes="120px"
                        src={story.imageUrl}
                        unoptimized={!isOptimizableImage(story.imageUrl)}
                      />
                    </span>
                    <span className="flex flex-col gap-1">
                      <span className="text-body-base text-gm-heading leading-body-base font-bold group-hover:underline">
                        {story.title}
                      </span>
                      <span className="text-body-sm text-gm-text-muted leading-body-sm">
                        {story.published}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </FeedState>
    </HomeSection>
  );
}

/** The questions people ask most, answered in the CMS by GMS. */
export async function Explained() {
  if (await isSectionHidden("questions")) return null;
  const { questions, settings } = await fetchHomeContent();
  const words = sectionWords(settings, "questions", {
    kicker: "Explained by GMS",
    title: "Questions about the weather",
  });
  return (
    <HomeSection
      {...words}
      link={{ href: "/explore/explained", label: "All questions" }}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Link
          className="group rounded-gm-card bg-gm-navy text-gm-text-inverse flex flex-col justify-end gap-2 p-6"
          href="/explore/explained"
        >
          <span className="text-gm-lime text-label leading-label font-bold tracking-wider uppercase">
            Grenada weather
          </span>
          <span className="font-gm-display text-gm-display font-bold tracking-wide text-balance uppercase">
            Grenada's weather and climate, explained
          </span>
          <span className="text-body-base text-gm-text-inverse/85 leading-body-base max-w-prose">
            Plain-language explainers from the forecast desk: trade winds,
            tropical waves, rain shadows and what a forecast really says.
          </span>
          <span className="text-body text-gm-lime leading-body flex items-center gap-1 font-semibold group-hover:underline">
            Read the explainers
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </span>
        </Link>
        <div>
          <FeedState
            count={questions.questions.length}
            empty="No questions are published yet."
            unavailable={
              questions.status === "unavailable" &&
              "Questions cannot be retrieved right now."
            }
          >
            <ul className="border-gm-border border-t">
              {questions.questions.map((item) => (
                <li className="border-gm-border border-b" key={item.id}>
                  <Link
                    className="text-body-base text-gm-heading leading-body-base flex items-center justify-between gap-3 py-3.5 font-semibold hover:underline"
                    href={questionHref(item.slug) as Route}
                  >
                    {item.question}
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </FeedState>
          <Link
            className="rounded-gm-card bg-gm-surface-panel text-body-base text-gm-heading leading-body-base mt-4 flex items-center justify-between gap-3 p-4 font-semibold hover:underline"
            href="/explore/ask"
          >
            Have a question? Ask a meteorologist
            <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0" />
          </Link>
        </div>
      </div>
    </HomeSection>
  );
}

/**
 * Latest reports: CMS write-ups, each about one issued report whose live
 * summary comes from FastAPI. Only written-up reports appear here; every issued
 * product stays in "All issued products". Then the "get official alerts" band.
 */
export async function LatestReports() {
  if (await isSectionHidden("reports")) return null;
  const { reportNotes: notes, settings } = await fetchHomeContent();
  const words = sectionWords(settings, "reports", {
    kicker: "Official GMS products, explained",
    title: "Latest reports",
  });
  const [lead, ...rest] = notes.articles;
  return (
    <HomeSection
      {...words}
      link={{ href: "/weather/issued", label: "All issued products" }}
    >
      <FeedState
        count={notes.articles.length}
        empty="No report write-ups are published yet."
        unavailable={
          notes.status === "unavailable" &&
          "Report write-ups cannot be retrieved right now."
        }
      >
        {lead && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <article className={`${HOME_CARD} flex flex-col gap-3`}>
              <h3 className="text-gm-heading text-heading-sm leading-heading-sm font-bold text-balance">
                <Link
                  className="hover:underline"
                  href={contentHref(lead) as Route}
                >
                  {lead.title}
                </Link>
              </h3>
              {lead.summary && (
                <p className="text-body-base leading-body-base max-w-prose">
                  {lead.summary}
                </p>
              )}
            </article>
            {rest.length > 0 && (
              <ul className="flex flex-col gap-3">
                {rest.slice(0, 5).map((note) => (
                  <li key={note.id}>
                    <Link
                      className={`${HOME_CARD} hover:border-gm-blue-ink flex flex-col gap-1`}
                      href={contentHref(note) as Route}
                    >
                      {note.linkedProduct && (
                        <span className="text-gm-sky-ink text-label leading-label font-bold tracking-wider uppercase">
                          {note.linkedProduct.kind &&
                          isProductKind(note.linkedProduct.kind)
                            ? productTitle(note.linkedProduct.kind)
                            : note.linkedProduct.title}
                        </span>
                      )}
                      <span className="text-body text-gm-heading leading-body font-bold">
                        {note.title}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </FeedState>
    </HomeSection>
  );
}

/**
 * A slim navy strip under the sky hero: subscribe to warnings before they are
 * needed. Live alerts themselves sit above it (header pill, hero takeover).
 */
export function GetAlertsStrip() {
  return (
    <section
      aria-labelledby="get-alerts-title"
      className="bg-background pt-3 pb-4 lg:pt-4 lg:pb-6"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 xl:px-8">
        <div className="rounded-gm-card border-gm-border bg-gm-navy text-gm-text-inverse flex flex-col gap-3 border px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2 sm:py-3">
          <div className="flex min-w-0 flex-1 items-center justify-center gap-3 sm:justify-start sm:gap-4">
            <BellIcon
              aria-hidden="true"
              className="text-gm-lime size-5 shrink-0"
            />
            <div className="min-w-0 sm:flex-1">
              <h2
                className="text-body-base leading-body-base font-bold"
                id="get-alerts-title"
              >
                Get official alerts first
              </h2>
              <p className="text-body-sm text-gm-text-inverse/85 leading-body-sm hidden sm:block">
                The GMS app sends alerts the moment we issue them, or choose
                WhatsApp, email or a feed.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              className="bg-gm-lime text-body text-gm-navy leading-body flex h-11 items-center justify-center gap-2 rounded-md px-4 font-bold"
              href="/app-guide"
            >
              <SmartphoneIcon aria-hidden="true" className="size-4" />
              Get the app
            </Link>
            <Link
              className="border-gm-text-inverse/30 text-body-sm leading-body-sm hover:bg-gm-text-inverse/10 flex h-11 items-center justify-center rounded-md border px-3 font-semibold"
              href="/alerts/get-alerts"
            >
              Other channels
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
