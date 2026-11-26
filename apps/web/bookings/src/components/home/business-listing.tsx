import type {
  BookingBusinessType,
  BookingPublicBusiness,
  BookingPublicBusinessPage,
} from "@barrelsgd/api-client";
import { cn } from "@barrelsgd/ui/lib/utils";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { pageAccent } from "@/lib/brand-colour";
import type { ListingQuery } from "@/lib/business-listing-query";
import { INK, TYPE_FILL } from "@/lib/business-type-colours";
import { businessTypeLabel } from "@/lib/business-types";
import { safeCoverUrl, safeLogoUrl } from "@/lib/storefront-brand";
import { businessTransitionStyle } from "@/lib/view-transition";
import { BusinessTypeIcon } from "./business-type-icon";
import { ServiceTiles } from "./service-tiles";

// Server rendered: the search is a plain GET form and the type tiles and pages
// are links, so the list works before any script loads. Every link is 44 px tall.
const LINK =
  "press inline-flex min-h-11 items-center rounded-full px-3 font-medium underline underline-offset-4 focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";
// A ring offset keeps the focus ring visible on white and on saturated fills.
const FOCUS =
  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";
/**
 * Entrance timing for rail card `index`: arrival gaps shrink (90, 150, 200,
 * then 240 ms for every later card together) and the distance shrinks with
 * them (24 px from the right, then 16, 12 and 8 px rises). Set on the card's
 * own element; its inside never staggers.
 */
export function cardEntrance(index: number): CSSProperties {
  const steps = [
    { d: 90, x: 24, y: 0 },
    { d: 150, x: 0, y: 16 },
    { d: 200, x: 0, y: 12 },
    { d: 240, x: 0, y: 8 },
  ];
  const step = steps[Math.min(index, steps.length - 1)] ?? steps[0];
  return {
    "--d": `${step?.d}ms`,
    "--x": `${step?.x}px`,
    "--y": `${step?.y}px`,
  } as CSSProperties;
}

/** Scroll-reveal range offsets for the first six tiles (gaps shrink); the rest share the last. */
const TILE_OFFSETS = [0, 4, 7, 9, 11, 13];

export function tileOffset(index: number): CSSProperties {
  const offset = TILE_OFFSETS[Math.min(index, TILE_OFFSETS.length - 1)];
  return { "--o": offset } as CSSProperties;
}

const H2 = "text-[19px] font-bold tracking-tight md:text-xl";
const TILE = `press lift relative flex h-full flex-col justify-between rounded-[26px] p-[14px_16px] text-[19px] font-bold text-white md:rounded-[28px] ${FOCUS}`;
// The chosen tile gets a white inner ring.
const TILE_CHOSEN = "chosen-ring";

/**
 * The home page address for a query, as a typed route object (the page number is
 * kept only past page 1). Typed routes reject a plain string built at run time.
 */
export function listingHref(query: Partial<ListingQuery>): {
  pathname: "/";
  query?: Record<string, string>;
} {
  const params: Record<string, string> = {};
  if (query.q) {
    params.q = query.q;
  }
  if (query.category) {
    params.category = query.category;
  }
  if (query.type) {
    params.type = query.type;
  }
  if (query.page && query.page > 1) {
    params.page = String(query.page);
  }
  return Object.keys(params).length > 0
    ? { pathname: "/", query: params }
    : { pathname: "/" };
}

function BusinessCard({ card }: Readonly<{ card: BookingPublicBusiness }>) {
  const logo = safeLogoUrl(card.logo_url);
  const cover = safeCoverUrl(card.cover_url);
  // A brand colour that clears 4.5:1 against white fills the card, so white
  // text is safe on it; any other business gets neutral ink and stays distinct.
  const fill = pageAccent(card.brand_color) ?? INK;
  const kind =
    card.category ??
    (card.business_type ? businessTypeLabel(card.business_type) : null);
  const where = [kind, card.city].filter(Boolean).join(" · ");
  const services = card.featured_services ?? [];
  const transition = businessTransitionStyle(card.slug);
  return (
    <Link
      className={`press lift flex h-full flex-col rounded-[36px] p-3 text-white md:rounded-[40px] ${FOCUS}`}
      href={{ pathname: `/${card.slug}` }}
      style={{ backgroundColor: fill }}
    >
      <span className="flex flex-1 flex-col items-center justify-center gap-2 px-3 text-center">
        {logo ? (
          <span
            aria-hidden="true"
            className="bg-background flex size-[52px] items-center justify-center overflow-hidden rounded-full"
          >
            <Image
              alt=""
              className="size-9 object-contain"
              height={36}
              referrerPolicy="no-referrer"
              src={logo}
              unoptimized
              width={36}
            />
          </span>
        ) : null}
        <h3
          className={cn(
            transition ? "vt-biz" : undefined,
            "text-[30px] leading-[1.05] font-extrabold tracking-tight md:text-[32px]"
          )}
          style={transition}
        >
          {card.name}
        </h3>
        {where && <span className="text-sm font-medium">{where}</span>}
      </span>
      {services.length > 0 ? (
        <ServiceTiles services={services} />
      ) : (
        <BottomPanel cover={cover} description={card.short_description} />
      )}
    </Link>
  );
}

/** The photo panel when there is a safe cover, else a white panel with the blurb and a Book pill. */
function BottomPanel({
  cover,
  description,
}: Readonly<{ cover: string | null; description: string | null | undefined }>) {
  if (cover) {
    return (
      <span
        aria-hidden="true"
        className="bg-ground relative block h-[150px] overflow-hidden rounded-[26px]"
      >
        <Image
          alt=""
          className="absolute inset-0 size-full object-cover"
          height={300}
          referrerPolicy="no-referrer"
          src={cover}
          unoptimized
          width={600}
        />
      </span>
    );
  }
  return (
    <span className="bg-background text-foreground flex h-[150px] flex-col justify-between rounded-[26px] p-4">
      <span className="line-clamp-3 text-sm">{description}</span>
      <span
        aria-hidden="true"
        className="bg-primary text-primary-foreground inline-flex min-h-11 items-center justify-center self-start rounded-full px-6 text-[15px] font-semibold"
      >
        Book
      </span>
    </span>
  );
}

/** What an empty list says: a search with no match, a page past the last, or none yet. */
function emptyMessage(filtered: boolean, page: number): string {
  if (filtered) {
    return "No businesses match that search. Try another word or category.";
  }
  if (page > 1) {
    return "No businesses on this page.";
  }
  return "No businesses listed yet. Businesses appear here once they choose to be listed.";
}

function SearchPill({ query }: Readonly<{ query: ListingQuery }>) {
  return (
    <search className="vt-search sticky top-4 z-20 w-full md:mx-auto md:max-w-lg">
      <form
        action="/"
        className="search-pill bg-background focus-within:ring-ring relative flex h-[60px] w-full items-center gap-3 rounded-full pr-2 pl-5 shadow-md focus-within:ring-2 md:h-16 md:pl-6"
        method="get"
      >
        <svg
          aria-hidden="true"
          className="text-muted-foreground size-[22px] shrink-0"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.2"
          viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <label className="sr-only" htmlFor="home-search">
          Search businesses
        </label>
        <input
          className="placeholder:text-muted-foreground min-h-11 min-w-0 flex-1 bg-transparent text-base outline-none md:text-[17px]"
          defaultValue={query.q ?? ""}
          id="home-search"
          maxLength={80}
          name="q"
          placeholder="What do you want to book today?"
          type="search"
        />
        {query.category && (
          <input name="category" type="hidden" value={query.category} />
        )}
        {query.type && <input name="type" type="hidden" value={query.type} />}
        <button
          aria-label="Search"
          className={`press bg-primary text-primary-foreground inline-flex size-11 shrink-0 items-center justify-center rounded-full ${FOCUS}`}
          type="submit"
        >
          <svg
            aria-hidden="true"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2.4"
            viewBox="0 0 24 24"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
    </search>
  );
}

/** Laptops only: the compact row under the search, a colour dot and a word per type. */
function TypeRow({
  available,
  chosen,
  q,
}: Readonly<{
  available: BookingBusinessType[];
  chosen: BookingBusinessType | undefined;
  q: string | undefined;
}>) {
  if (available.length === 0) {
    return null;
  }
  const items: {
    fill: string;
    label: string;
    type: BookingBusinessType | undefined;
  }[] = [
    { type: undefined, label: "All", fill: INK },
    ...available.map((type) => ({
      type,
      label: businessTypeLabel(type),
      fill: TYPE_FILL[type],
    })),
  ];
  return (
    <nav
      aria-label="Business types"
      className="hidden flex-wrap justify-center gap-x-6 md:flex"
    >
      {items.map((item) => {
        const selected = item.type === chosen;
        return (
          <Link
            aria-current={selected ? "page" : undefined}
            className={`press flex min-h-11 items-center gap-2 rounded-full px-1 text-[15px] ${selected ? "font-extrabold underline underline-offset-4" : "font-semibold"} ${FOCUS}`}
            href={listingHref({ q, type: item.type })}
            key={item.label}
          >
            <span
              aria-hidden="true"
              className="size-[30px] rounded-full"
              style={{ backgroundColor: item.fill }}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * One saturated tile per type the API says has a listed business, in its
 * order, after an "All" tile. A tile keeps the search words and clears the
 * category and page.
 */
function TypeTiles({
  available,
  chosen,
  q,
}: Readonly<{
  available: BookingBusinessType[];
  chosen: BookingBusinessType | undefined;
  q: string | undefined;
}>) {
  const items: {
    fill: string;
    label: string;
    type: BookingBusinessType | undefined;
  }[] = [
    { type: undefined, label: "All", fill: INK },
    ...available.map((type) => ({
      type,
      label: businessTypeLabel(type),
      fill: TYPE_FILL[type],
    })),
  ];
  return (
    <nav
      aria-label="Browse by type"
      className="grid grid-cols-2 gap-2 md:grid-cols-6"
    >
      {items.map((item, index) => {
        const selected = item.type === chosen;
        return (
          <div
            className="reveal h-[118px] md:h-[140px]"
            key={item.label}
            style={tileOffset(index)}
          >
            <Link
              aria-current={selected ? "page" : undefined}
              className={`${TILE} ${selected ? TILE_CHOSEN : ""}`}
              href={listingHref({ q, type: item.type })}
              style={{ backgroundColor: item.fill }}
            >
              {item.label}
              <span className="flex justify-end">
                <BusinessTypeIcon
                  className="size-12"
                  strokeWidth={1.6}
                  type={item.type ?? "all"}
                />
              </span>
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

export function BusinessListing({
  listing,
  query,
  intro,
}: Readonly<{
  /** The hero (it holds the one h1) and the line under it. */
  intro?: ReactNode;
  /** One page from the API; null when it could not be loaded. */
  listing: BookingPublicBusinessPage | null;
  query: ListingQuery;
}>) {
  const filtered = Boolean(query.q || query.category || query.type);
  const available = listing?.types_available ?? [];
  return (
    <>
      <SearchPill query={query} />
      {listing && (
        <TypeRow available={available} chosen={query.type} q={query.q} />
      )}
      {intro}

      <section
        aria-labelledby="businesses-heading"
        className="flex scroll-mt-24 flex-col gap-3"
        id="businesses"
      >
        <h2
          className={`${H2} enter-fade`}
          id="businesses-heading"
          style={{ "--d": "80ms" } as CSSProperties}
        >
          Businesses to book
        </h2>

        {listing === null && (
          <p className="text-foreground" role="alert">
            Businesses cannot be loaded right now. Try again in a few minutes.
          </p>
        )}

        {listing && listing.items.length === 0 && (
          <p className="text-foreground">
            {emptyMessage(filtered, listing.page)}
          </p>
        )}

        {listing && listing.items.length > 0 && (
          <ul className="rail -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pt-1 pb-4 md:mx-0 md:scroll-px-0 md:px-0">
            {listing.items.map((card, index) => (
              <li
                className="enter h-[470px] w-[316px] shrink-0 snap-start md:h-[500px] md:w-[330px]"
                key={card.slug}
                style={cardEntrance(index)}
              >
                <BusinessCard card={card} />
              </li>
            ))}
          </ul>
        )}

        {listing && (listing.page > 1 || listing.has_more) && (
          <nav aria-label="Pages" className="flex justify-between gap-2">
            {listing.page > 1 ? (
              <Link
                className={LINK}
                href={listingHref({
                  q: query.q,
                  category: query.category,
                  type: query.type,
                  page: listing.page - 1,
                })}
                rel="prev"
              >
                Previous page
              </Link>
            ) : (
              <span />
            )}
            {listing.has_more && (
              <Link
                className={LINK}
                href={listingHref({
                  q: query.q,
                  category: query.category,
                  type: query.type,
                  page: listing.page + 1,
                })}
                rel="next"
              >
                Next page
              </Link>
            )}
          </nav>
        )}
      </section>

      {/* A public page: with no type to show, the whole block is left out, since
          a heading over "No business types yet." reads as broken to a visitor. */}
      {listing && available.length > 0 && (
        <section
          aria-labelledby="types-heading"
          className="flex scroll-mt-24 flex-col gap-3"
          id="types"
        >
          <h2 className={H2} id="types-heading">
            Types of business
          </h2>
          <TypeTiles available={available} chosen={query.type} q={query.q} />
        </section>
      )}
    </>
  );
}
