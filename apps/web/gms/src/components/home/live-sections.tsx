import { isProductKind, productTitle } from "@barrelsgd/gms/products";
import {
  ArrowRightIcon,
  ChevronRightIcon,
  CloudSunIcon,
  PlayIcon,
  TornadoIcon,
} from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { HOME_CARD, HomeSection } from "@/components/home/home-section";
import { fetchActiveAlerts } from "@/lib/cap";
import { alertsLevel } from "@/lib/cap-alerts";
import { postedLabel } from "@/lib/clock";
import {
  contentHref,
  fetchHomeContent,
  isOptimizableImage,
  isSectionHidden,
  type PublishedContent,
  questionHref,
  sectionWords,
} from "@/lib/cms";
import { buildDeskFeed, type OfficialCard } from "@/lib/desk-feed";
import { contentToArticle } from "@/lib/editorial";
import { mediaEmbed } from "@/lib/media-embed";
import { fetchPublishedProducts } from "@/lib/products";
import { cn } from "@/lib/utils";

/** The same bordered notice as "Grenada in data": one line, aligned to the heading. */
const NOTICE = cn(HOME_CARD, "p-4 text-body-sm text-gm-text-secondary");

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

/** One card in the From the Desk row: most of a phone screen, fixed width above. */
const CARD_ITEM =
  "relative w-[85%] shrink-0 snap-start sm:w-[22rem] lg:w-[24rem]";

const NAME_SEPARATORS = /[\s._-]+/;

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
const FORMAT_LABEL = {
  audio: "Listen",
  video: "Watch",
  chart: "Chart",
} as const;

function DeskPostCard({ item }: { item: PublishedContent }) {
  const posted = item.publishedAt ?? item.updatedAt;
  const format = item.format ?? "standard";
  const media =
    format === "audio" || format === "video"
      ? mediaEmbed(format, item.mediaUrl ?? null)
      : null;
  // `relative` keeps the link's screen-reader text inside the scrolling row;
  // without it that hidden text widens the whole page on phones.
  return (
    <li className={CARD_ITEM}>
      <article className={cn(HOME_CARD, "flex h-full flex-col gap-3")}>
        <header className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gm-sky-ink font-bold text-body-sm text-gm-text-inverse leading-body-sm"
          >
            {avatarInitials(item.authorName)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-bold text-body text-gm-heading leading-body">
              {item.authorName ?? "The forecasters"}
            </span>
            <span className="text-body-sm text-gm-text-secondary leading-body-sm">
              {item.authorRole && <>{item.authorRole} · </>}
              <time dateTime={posted}>{postedLabel(posted)}</time>
            </span>
          </span>
        </header>
        <h3 className="text-balance font-bold text-gm-heading text-heading-sm leading-heading-sm">
          <Link className="hover:underline" href={contentHref(item) as Route}>
            {item.title}
          </Link>
        </h3>
        {item.summary && (
          <p className="text-body-base leading-body-base">{item.summary}</p>
        )}
        {format !== "standard" && (
          <span className="w-fit rounded-full bg-gm-surface-panel px-2.5 py-0.5 font-bold text-gm-heading text-label uppercase leading-label tracking-wider">
            {FORMAT_LABEL[format]}
          </span>
        )}
        {item.linkedProduct && (
          <span className="w-fit rounded-full bg-gm-surface-panel px-2.5 py-0.5 font-bold text-gm-heading text-label uppercase leading-label tracking-wider">
            {item.linkedProduct.kind && isProductKind(item.linkedProduct.kind)
              ? productTitle(item.linkedProduct.kind)
              : item.linkedProduct.title}
          </span>
        )}
        {item.imageUrl && (
          <figure className="flex flex-col gap-1">
            <span className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gm-surface-panel">
              <Image
                alt={item.imageAlt ?? ""}
                className="object-cover"
                fill
                sizes="(min-width: 640px) 24rem, 85vw"
                src={item.imageUrl}
                unoptimized={!isOptimizableImage(item.imageUrl)}
              />
            </span>
            {item.imageCredit && (
              <figcaption className="text-caption text-gm-text-muted leading-caption">
                {item.imageCredit}
              </figcaption>
            )}
          </figure>
        )}
        {media && (
          // Nothing loads from the provider until the reader follows the link.
          <a
            className="flex w-fit items-center gap-2 rounded-full bg-gm-surface-panel px-3 py-1.5 font-semibold text-body-sm text-gm-heading leading-body-sm hover:underline"
            href={media.href}
            rel="noopener noreferrer"
            target="_blank"
          >
            <PlayIcon aria-hidden="true" className="size-4" />
            {format === "audio" ? "Listen" : "Watch"} on {media.provider}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
        <Link
          className="mt-auto flex w-fit items-center gap-1 font-semibold text-body text-gm-blue-ink leading-body hover:underline"
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
 * An issued product as an official card: navy label, the product's own
 * summary, an illustration below the words, issue and validity times and a
 * link to the issued product. Official cards carry no emoji.
 */
function OfficialProductCard({ card }: { card: OfficialCard }) {
  const Icon = card.kind === "briefing" ? CloudSunIcon : TornadoIcon;
  return (
    <li className={CARD_ITEM}>
      <article
        className={cn(HOME_CARD, "flex h-full flex-col gap-3 border-gm-navy")}
      >
        <header className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gm-navy font-bold text-body-sm text-gm-text-inverse leading-body-sm"
          >
            GMS
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-bold text-body text-gm-heading leading-body">
              GMS forecast office
            </span>
            <span className="text-body-sm text-gm-text-secondary leading-body-sm">
              Official product
            </span>
          </span>
        </header>
        <span className="w-fit rounded-full bg-gm-navy px-2.5 py-0.5 font-bold text-gm-text-inverse text-label uppercase leading-label tracking-wider dark:text-gm-navy">
          {card.kind === "briefing" ? "Official briefing" : "Official"}
        </span>
        <h3 className="text-balance font-bold text-gm-heading text-heading-sm leading-heading-sm">
          <Link className="hover:underline" href={card.href as Route}>
            {card.title}
          </Link>
        </h3>
        {card.summary && (
          <p className="line-clamp-5 text-body-base leading-body-base">
            {card.summary}
          </p>
        )}
        <span
          aria-hidden="true"
          className="flex aspect-[16/9] items-center justify-center rounded-lg bg-gm-surface-panel text-gm-sky-ink"
        >
          <Icon className="size-12" strokeWidth={1.5} />
        </span>
        <p className="rounded-lg bg-gm-surface px-3 py-2 text-body-sm text-gm-text-secondary tabular-nums leading-body-sm">
          {card.issued}
          {card.valid && <> · {card.valid}</>}
        </p>
        {card.staleNote && (
          <p className="font-semibold text-body-sm text-gm-heading leading-body-sm">
            {card.staleNote}
          </p>
        )}
        <Link
          className="mt-auto flex w-fit items-center gap-1 font-semibold text-body text-gm-blue-ink leading-body hover:underline"
          href={card.href as Route}
        >
          Read the {card.title}
          <ArrowRightIcon aria-hidden="true" className="size-4" />
        </Link>
      </article>
    </li>
  );
}

const ROW =
  "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 xl:-mx-8 xl:scroll-px-8 xl:px-8 max-lg:[scrollbar-width:none] max-lg:[&::-webkit-scrollbar]:hidden";

/**
 * From the Desk (homepage v2, owner 1 Nov 2026): one row of cards that
 * scrolls sideways. The latest public forecast is pinned first and the latest
 * Tropical Weather Outlook follows, both read live from FastAPI; then the
 * desk posts and report write-ups from the CMS, newest first. Under a red
 * warning the desk posts wait behind "Earlier posts" so the official words lead.
 */
export async function ForecastDesk() {
  if (await isSectionHidden("desk")) return null;
  const [content, products, alerts] = await Promise.all([
    fetchHomeContent(),
    fetchPublishedProducts(),
    fetchActiveAlerts(),
  ]);
  const { deskUpdates: updates, reportNotes: notes, settings } = content;
  const words = sectionWords(settings, "desk", {
    kicker: "Latest from the forecasters",
    title: "From the Desk",
  });
  const showNotes = !settings.hiddenSections.includes("reports");
  const feed = buildDeskFeed({
    level: alertsLevel(alerts),
    posts: [...updates.articles, ...(showNotes ? notes.articles : [])],
    products: products.products,
    productsAvailable: products.status === "ok",
  });
  const postCards = feed.posts.map((item) => (
    <DeskPostCard item={item} key={item.id} />
  ));
  return (
    <HomeSection
      {...words}
      link={{ href: "/explore/updates", label: "All desk posts" }}
    >
      {products.status === "unavailable" && (
        <p className={cn(NOTICE, "mb-3")} role="status">
          Issued forecasts cannot be retrieved right now. See{" "}
          <Link
            className="font-semibold text-gm-blue-ink underline"
            href="/weather/issued"
          >
            all issued products
          </Link>
          .
        </p>
      )}
      <FeedState
        count={
          feed.official.length +
          feed.posts.length +
          (feed.missingBriefing ? 1 : 0)
        }
        empty="No forecasts or desk posts are published yet."
        unavailable={
          updates.status === "unavailable" &&
          feed.official.length === 0 &&
          "Desk updates cannot be retrieved right now."
        }
      >
        <ul aria-label="Latest from the forecast desk" className={ROW}>
          {feed.missingBriefing && (
            <li className={CARD_ITEM}>
              <article
                className={cn(
                  HOME_CARD,
                  "flex h-full flex-col gap-3 border-gm-navy"
                )}
              >
                <span className="w-fit rounded-full bg-gm-navy px-2.5 py-0.5 font-bold text-gm-text-inverse text-label uppercase leading-label tracking-wider dark:text-gm-navy">
                  Official briefing
                </span>
                <h3 className="font-bold text-gm-heading text-heading-sm leading-heading-sm">
                  Public Weather Forecast
                </h3>
                <p className="text-body-base leading-body-base">
                  {feed.missingBriefing}
                </p>
                <Link
                  className="mt-auto flex w-fit items-center gap-1 font-semibold text-body text-gm-blue-ink leading-body hover:underline"
                  href={"/weather/issued" as Route}
                >
                  All issued products
                  <ArrowRightIcon aria-hidden="true" className="size-4" />
                </Link>
              </article>
            </li>
          )}
          {feed.official.map((card) => (
            <OfficialProductCard card={card} key={card.id} />
          ))}
          {!feed.collapsePosts && postCards}
        </ul>
        {feed.collapsePosts && postCards.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer font-semibold text-body text-gm-blue-ink leading-body">
              Earlier posts ({postCards.length})
            </summary>
            <ul aria-label="Earlier desk posts" className={cn(ROW, "mt-3")}>
              {postCards}
            </ul>
          </details>
        )}
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
              <span className="relative aspect-video overflow-hidden rounded-gm-card bg-gm-surface-panel">
                <Image
                  alt=""
                  className="object-cover"
                  fill
                  sizes="(min-width: 1024px) 60vw, 100vw"
                  src={lead.imageUrl}
                  unoptimized={!isOptimizableImage(lead.imageUrl)}
                />
              </span>
              <span className="text-balance font-bold text-gm-heading text-heading-base leading-heading-base group-hover:underline">
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
              {/* Six rows; phones show three (owner, 1 Nov 2026). */}
              {rest.slice(0, 6).map((story, index) => (
                <li
                  className={cn(index >= 3 && "hidden sm:block")}
                  key={story.id}
                >
                  <Link
                    className="group grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3"
                    href={story.href as Route}
                  >
                    <span className="relative aspect-video overflow-hidden rounded-lg bg-gm-surface-panel">
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
                      <span className="font-bold text-body-base text-gm-heading leading-body-base group-hover:underline">
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
      tone="surface"
      {...words}
      link={{ href: "/explore/explained", label: "All questions" }}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Link
          className="group flex flex-col justify-end gap-2 rounded-gm-card bg-gm-navy p-6 text-gm-text-inverse"
          href="/explore/explained"
        >
          <span className="font-bold text-gm-lime text-label uppercase leading-label tracking-wider">
            Grenada weather
          </span>
          <span className="text-balance font-bold font-gm-display text-gm-display uppercase tracking-wide">
            Grenada's weather and climate, explained
          </span>
          <span className="max-w-prose text-body-base text-gm-text-inverse/85 leading-body-base">
            Plain-language explainers from the forecast desk: trade winds,
            tropical waves, rain shadows and what a forecast really says.
          </span>
          <span className="flex items-center gap-1 font-semibold text-body text-gm-lime leading-body group-hover:underline">
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
                    className="flex items-center justify-between gap-3 py-3.5 font-semibold text-body-base text-gm-heading leading-body-base hover:underline"
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
            className="mt-4 flex items-center justify-between gap-3 rounded-gm-card bg-gm-surface-panel p-4 font-semibold text-body-base text-gm-heading leading-body-base hover:underline"
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
