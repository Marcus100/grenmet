import {
  ArrowRightIcon,
  BellIcon,
  ChevronRightIcon,
  FileTextIcon,
  MailIcon,
  MessageCircleIcon,
  RssIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { HOME_CARD, HomeSection } from "@/components/home/home-section";
import { fetchPublishedContent } from "@/lib/cms";
import { contentToArticle } from "@/lib/editorial";
import type { WeatherSnapshot } from "@/lib/forecast-data";

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

/**
 * Official products, labelled as such: the issued forecast as a memo, and the
 * latest product updates beside it. Kept visually separate from editorial.
 */
export async function ForecastDesk({ weather }: { weather: WeatherSnapshot }) {
  const today = weather.days[0];
  const updates = await fetchPublishedContent("latest");
  return (
    <HomeSection
      kicker="Official GMS products"
      link={{ href: "/alerts/bulletins", label: "All bulletins" }}
      title="From the forecast desk"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <article className={`${HOME_CARD} flex flex-col gap-3`}>
          <span className="flex w-fit items-center gap-1.5 rounded bg-gm-surface-panel px-2 py-1 font-bold text-gm-heading text-label uppercase leading-label tracking-wider">
            <ShieldCheckIcon aria-hidden="true" className="size-4" />
            Official forecast
          </span>
          <h3 className="text-balance font-bold text-gm-heading text-heading-sm leading-heading-sm">
            {today.title ?? "Today's forecast"}
          </h3>
          <p className="max-w-prose text-body-base leading-body-base">
            {today.summary}
          </p>
          <p className="text-body-sm text-gm-text-secondary leading-body-sm">
            {weather.label}
          </p>
          <Link
            className="flex h-11 w-fit items-center rounded-md bg-gm-navy px-4 font-bold text-body text-gm-text-inverse leading-body"
            href="/weather/issued"
          >
            Issued forecasts
          </Link>
        </article>

        <div className="rounded-gm-card border border-gm-border bg-background">
          <FeedState
            count={updates.articles.length}
            empty="No product updates are published yet."
            unavailable={
              updates.status === "unavailable" &&
              "Product updates cannot be retrieved right now."
            }
          >
            <ul>
              {updates.articles.slice(0, 5).map((item) => (
                <li
                  className="border-gm-border border-t first:border-t-0"
                  key={item.id}
                >
                  <Link
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-gm-surface"
                    href={`/explore/updates/${item.slug}`}
                  >
                    <span className="flex size-9 items-center justify-center rounded-lg bg-gm-surface-panel text-gm-heading">
                      <FileTextIcon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="font-semibold text-body text-gm-heading leading-body">
                      {item.title}
                    </span>
                    <time
                      className="font-mono text-body-sm text-gm-text-secondary leading-body-sm"
                      dateTime={item.updatedAt}
                    >
                      {SHORT_DATE.format(new Date(item.updatedAt))}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          </FeedState>
        </div>
      </div>
    </HomeSection>
  );
}

/** Editorial stories: one lead, the rest in a side column. */
export async function Stories() {
  const result = await fetchPublishedContent("weather-news");
  const [lead, ...rest] = result.articles.map(contentToArticle);
  return (
    <HomeSection
      kicker="Earth & Weather"
      link={{ href: "/explore/news", label: "More stories" }}
      title="Stories from our atmosphere and ocean"
      tone="surface"
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

const QUESTIONS = [
  { q: "What do Outlook, Watch and Warning mean?", href: "/alerts/levels" },
  { q: "How do I read a warning?", href: "/alerts/understanding" },
  { q: "What is Saharan dust, and why is it hazy?", href: "/weather/dust" },
  { q: "How are hurricanes named?", href: "/explore/hurricane-names" },
  { q: "What do the words in a forecast mean?", href: "/explore/glossary" },
] as const;

/** Explainers and the questions people ask most, answered by existing pages. */
export function Explained() {
  return (
    <HomeSection
      kicker="Explained by GMS"
      link={{ href: "/explore/explained", label: "All explainers" }}
      title="Questions about Grenada's weather"
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
          <ul className="border-gm-border border-t">
            {QUESTIONS.map((item) => (
              <li className="border-gm-border border-b" key={item.href}>
                <Link
                  className="flex items-center justify-between gap-3 py-3.5 font-semibold text-body-base text-gm-heading leading-body-base hover:underline"
                  href={item.href}
                >
                  {item.q}
                  <ChevronRightIcon
                    aria-hidden="true"
                    className="size-4 shrink-0"
                  />
                </Link>
              </li>
            ))}
          </ul>
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

const CHANNELS = [
  { label: "WhatsApp", Icon: MessageCircleIcon },
  { label: "Email", Icon: MailIcon },
  { label: "CAP & RSS", Icon: RssIcon },
] as const;

/** Latest publications, then the navy "get official alerts first" band. */
export async function PublicationsAndAlerts() {
  const result = await fetchPublishedContent("latest-publications");
  const posts = result.articles.map(contentToArticle);
  return (
    <HomeSection
      kicker="Reports & publications"
      link={{ href: "/climate/publications", label: "All publications" }}
      title="Latest reports"
      tone="surface"
    >
      <FeedState
        count={posts.length}
        empty="No publications are available."
        unavailable={
          result.status === "unavailable" &&
          "Publications cannot be retrieved right now."
        }
      >
        <ul className="flex gap-3 overflow-x-auto pb-1">
          {posts.slice(0, 6).map((post) => (
            <li className="w-56 shrink-0" key={post.id}>
              <Link
                className={`${HOME_CARD} flex h-full flex-col gap-2 hover:border-gm-blue-ink`}
                href={post.href}
              >
                <FileTextIcon
                  aria-hidden="true"
                  className="size-5 text-gm-sky-ink"
                />
                <span className="font-bold text-body text-gm-heading leading-body">
                  {post.title}
                </span>
                <span className="text-body-sm text-gm-text-secondary leading-body-sm">
                  {post.published}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </FeedState>

      <div className="mt-8 grid items-center gap-5 rounded-gm-card bg-gm-navy p-6 text-gm-text-inverse lg:grid-cols-[1.3fr_1fr]">
        <div>
          <h2 className="font-bold font-gm-display text-gm-display uppercase tracking-wide">
            Get official alerts first
          </h2>
          <p className="mt-2 max-w-prose text-body-base text-gm-text-inverse/85 leading-body-base">
            The GMS app sends alerts the moment we issue them. Prefer something
            else? Choose WhatsApp, email or a feed.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Link
            className="flex h-11 w-fit items-center gap-2 rounded-md bg-gm-lime px-4 font-bold text-body text-gm-navy leading-body"
            href="/app-guide"
          >
            <SmartphoneIcon aria-hidden="true" className="size-4" />
            Get the GMS app
          </Link>
          <ul className="flex flex-wrap gap-2">
            {CHANNELS.map(({ label, Icon }) => (
              <li key={label}>
                <Link
                  className="flex items-center gap-1.5 rounded-full border border-gm-text-inverse/30 px-3 py-1.5 font-semibold text-body-sm leading-body-sm hover:bg-gm-text-inverse/10"
                  href="/alerts/get-alerts"
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                className="flex items-center gap-1.5 rounded-full border border-gm-text-inverse/30 px-3 py-1.5 font-semibold text-body-sm leading-body-sm hover:bg-gm-text-inverse/10"
                href="/alerts/get-alerts"
              >
                <BellIcon aria-hidden="true" className="size-4" />
                All channels
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </HomeSection>
  );
}
