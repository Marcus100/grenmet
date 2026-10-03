import { isProductKind, productTitle } from "@barrelsgd/gms/products";
import {
  ArrowRightIcon,
  BellIcon,
  ChevronRightIcon,
  FileTextIcon,
  SmartphoneIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { HOME_CARD, HomeSection } from "@/components/home/home-section";
import { LinkedProduct } from "@/components/linked-product";
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

const SHORT_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Grenada",
  day: "numeric",
  month: "short",
});

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
      <p className="p-4" role="status">
        {unavailable}
      </p>
    );
  }
  if (count === 0) {
    return <p className="p-4">{empty}</p>;
  }
  return children;
}

/** One desk post in the side list: icon, title, category, date. */
function DeskListItem({ item }: { item: PublishedContent }) {
  return (
    <li className="border-gm-border border-t first:border-t-0">
      <Link
        className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-gm-surface"
        href={contentHref(item)}
      >
        <span className="flex size-9 items-center justify-center rounded-lg bg-gm-surface-panel text-gm-heading">
          <FileTextIcon aria-hidden="true" className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold text-body text-gm-heading leading-body">
            {item.title}
          </span>
          {item.category && (
            <span className="text-body-sm text-gm-text-secondary leading-body-sm">
              {item.category}
            </span>
          )}
        </span>
        <time
          className="font-mono text-body-sm text-gm-text-secondary leading-body-sm"
          dateTime={item.publishedAt ?? item.updatedAt}
        >
          {SHORT_DATE.format(new Date(item.publishedAt ?? item.updatedAt))}
        </time>
      </Link>
    </li>
  );
}

/**
 * From the Desk: the forecast office blogging about what it issues. Posts are
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
  const [lead, ...rest] = updates.articles;
  return (
    <HomeSection
      {...words}
      link={{ href: "/explore/updates", label: "All desk updates" }}
    >
      <FeedState
        count={updates.articles.length}
        empty="No desk updates are published yet."
        unavailable={
          updates.status === "unavailable" &&
          "Desk updates cannot be retrieved right now."
        }
      >
        {lead && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <article className={`${HOME_CARD} flex flex-col gap-3`}>
              {lead.category && (
                <p className="font-bold text-gm-sky-ink text-label uppercase leading-label tracking-wider">
                  {lead.category}
                </p>
              )}
              <h3 className="text-balance font-bold text-gm-heading text-heading-sm leading-heading-sm">
                <Link className="hover:underline" href={contentHref(lead)}>
                  {lead.title}
                </Link>
              </h3>
              {lead.summary && (
                <p className="max-w-prose text-body-base leading-body-base">
                  {lead.summary}
                </p>
              )}
              {lead.linkedProduct && (
                <LinkedProduct productId={lead.linkedProduct.productId} />
              )}
            </article>
            {rest.length > 0 && (
              <ul className="rounded-gm-card border border-gm-border bg-background">
                {rest.slice(0, 4).map((item) => (
                  <DeskListItem item={item} key={item.id} />
                ))}
              </ul>
            )}
          </div>
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
    title: "Stories from our atmosphere and ocean",
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
            <Link className="group flex flex-col gap-2" href={lead.href}>
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
              {rest.slice(0, 4).map((story) => (
                <li key={story.id}>
                  <Link
                    className="group grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3"
                    href={story.href}
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
                    href={questionHref(item.slug)}
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
              <h3 className="text-balance font-bold text-gm-heading text-heading-sm leading-heading-sm">
                <Link className="hover:underline" href={contentHref(lead)}>
                  {lead.title}
                </Link>
              </h3>
              {lead.summary && (
                <p className="max-w-prose text-body-base leading-body-base">
                  {lead.summary}
                </p>
              )}
              {lead.linkedProduct && (
                <LinkedProduct productId={lead.linkedProduct.productId} />
              )}
            </article>
            {rest.length > 0 && (
              <ul className="flex flex-col gap-3">
                {rest.slice(0, 5).map((note) => (
                  <li key={note.id}>
                    <Link
                      className={`${HOME_CARD} flex flex-col gap-1 hover:border-gm-blue-ink`}
                      href={contentHref(note)}
                    >
                      {note.linkedProduct?.kind &&
                        isProductKind(note.linkedProduct.kind) && (
                          <span className="font-bold text-gm-sky-ink text-label uppercase leading-label tracking-wider">
                            {productTitle(note.linkedProduct.kind)}
                          </span>
                        )}
                      <span className="font-bold text-body text-gm-heading leading-body">
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-gm-card bg-gm-navy px-4 py-3 text-gm-text-inverse">
          <BellIcon
            aria-hidden="true"
            className="size-5 shrink-0 text-gm-lime"
          />
          <div className="min-w-0 flex-1">
            <h2
              className="font-bold text-body-base leading-body-base"
              id="get-alerts-title"
            >
              Get official alerts first
            </h2>
            <p className="hidden text-body-sm text-gm-text-inverse/85 leading-body-sm sm:block">
              The GMS app sends alerts the moment we issue them, or choose
              WhatsApp, email or a feed.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="flex h-11 items-center gap-2 rounded-md bg-gm-lime px-4 font-bold text-body text-gm-navy leading-body"
              href="/app-guide"
            >
              <SmartphoneIcon aria-hidden="true" className="size-4" />
              Get the app
            </Link>
            <Link
              className="flex h-11 items-center rounded-md border border-gm-text-inverse/30 px-3 font-semibold text-body-sm leading-body-sm hover:bg-gm-text-inverse/10"
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
