import type {
  BookingPublicBusiness,
  BookingPublicBusinessPage,
} from "@barrelsgd/api-client";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { pageAccent } from "@/lib/brand-colour";
import type { ListingQuery } from "@/lib/business-listing-query";
import { safeLogoUrl } from "@/lib/storefront-brand";

// Server rendered: the search is a plain GET form and the chips and pages are
// links, so the list works before any script loads. Every link is 44 px tall.
const LINK =
  "inline-flex min-h-11 items-center rounded-full px-2 font-medium underline underline-offset-4 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";
const CHIP =
  "inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-medium shadow-xs focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";
// One background per chip: the two never share a class list, so the result
// does not depend on the order of the rules in the stylesheet.
const CHIP_IDLE = "bg-background md:bg-ground";
const CHIP_CHOSEN = "bg-primary text-primary-foreground";
const CARD =
  "bg-background text-foreground rounded-[1.75rem] shadow-xs focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

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
  if (query.page && query.page > 1) {
    params.page = String(query.page);
  }
  return Object.keys(params).length > 0
    ? { pathname: "/", query: params }
    : { pathname: "/" };
}

function chipClass(selected: boolean): string {
  return `${CHIP} ${selected ? CHIP_CHOSEN : CHIP_IDLE}`;
}

/** Initial shown when a business has no logo. */
function firstLetter(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}

function BusinessCard({
  card,
  first = false,
}: Readonly<{ card: BookingPublicBusiness; first?: boolean }>) {
  const logo = safeLogoUrl(card.logo_url);
  const accent = pageAccent(card.brand_color);
  const where = [card.category, card.city].filter(Boolean).join(" · ");
  // The tile is a light tint of the brand colour with ink text, so the letter
  // reads at 4.5:1 whatever colour the business picked. Without a usable colour
  // it is the ground grey with a hairline, so it still reads as a tile.
  const tileStyle = accent
    ? { backgroundColor: `color-mix(in srgb, ${accent} 18%, white)` }
    : undefined;
  return (
    <Link
      className={`${CARD} flex h-full flex-col gap-2 p-2.5 md:gap-3 md:p-3`}
      href={{ pathname: `/${card.slug}` }}
    >
      <span
        aria-hidden="true"
        className={`${first ? "h-[170px] text-6xl" : "h-[104px] text-4xl"} bg-ground ring-border text-foreground flex w-full items-center justify-center overflow-hidden rounded-2xl font-bold ring-1 md:h-40 md:rounded-[1.25rem] md:text-[56px]`}
        style={tileStyle}
      >
        {logo ? (
          <Image
            alt=""
            className="max-h-[60%] w-auto max-w-[80%] object-contain"
            height={96}
            referrerPolicy="no-referrer"
            src={logo}
            unoptimized
            width={160}
          />
        ) : (
          firstLetter(card.name)
        )}
      </span>
      <span className="flex flex-1 flex-col gap-2 px-1 pb-1 md:px-1.5 md:pb-1.5">
        <span
          className={`flex gap-3 ${first ? "items-center" : "flex-col items-stretch"} md:flex-col md:items-stretch`}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h3
              className={`${first ? "text-lg font-bold" : "text-[15px] font-semibold"} md:text-[17px] md:font-bold`}
            >
              {card.name}
            </h3>
            {where && (
              <span className="text-muted-foreground text-[13px] md:text-sm">
                {where}
              </span>
            )}
          </span>
          <span
            aria-hidden="true"
            className={`${first ? "inline-flex" : "hidden md:inline-flex"} bg-primary text-primary-foreground min-h-11 shrink-0 items-center justify-center rounded-full px-5 text-[15px] font-semibold md:w-full`}
          >
            Book
          </span>
        </span>
        {first && card.short_description && (
          <span className="text-sm md:hidden">{card.short_description}</span>
        )}
      </span>
    </Link>
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

export function BusinessListing({
  listing,
  query,
  intro,
}: Readonly<{
  /** The h1 and intro line; from md up they share the white search card. */
  intro?: ReactNode;
  /** One page from the API; null when it could not be loaded. */
  listing: BookingPublicBusinessPage | null;
  query: ListingQuery;
}>) {
  const chosen = query.category?.toLowerCase();
  const filtered = Boolean(query.q || query.category);
  return (
    <section
      aria-labelledby="businesses-heading"
      className="flex flex-col gap-4"
    >
      <div className="md:bg-background flex flex-col gap-6 md:items-center md:gap-5 md:rounded-[2rem] md:px-8 md:py-12 md:text-center md:shadow-xs">
        {intro}
        <search className="w-full md:flex md:justify-center">
          <form
            action="/"
            className="bg-background md:bg-ground focus-within:ring-ring flex min-h-13 w-full items-center gap-2 rounded-full pr-1.5 pl-5 shadow-xs focus-within:ring-2 md:min-h-15 md:max-w-[560px] md:shadow-none"
            method="get"
          >
            <label className="sr-only" htmlFor="home-search">
              Search businesses
            </label>
            <input
              className="placeholder:text-muted-foreground min-h-11 min-w-0 flex-1 bg-transparent text-base outline-none"
              defaultValue={query.q ?? ""}
              id="home-search"
              maxLength={80}
              name="q"
              placeholder="Doctor, barber, mechanic, tutor"
              type="search"
            />
            {query.category && (
              <input name="category" type="hidden" value={query.category} />
            )}
            <button
              className="bg-primary text-primary-foreground min-h-11 rounded-full px-5 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              type="submit"
            >
              Search
            </button>
          </form>
        </search>

        {listing === null && (
          <p className="text-foreground" role="alert">
            Businesses cannot be loaded right now. Try again in a few minutes.
          </p>
        )}

        {listing && listing.categories.length === 0 && (
          <nav aria-label="Categories">
            <p className="text-foreground text-sm">No categories yet.</p>
          </nav>
        )}

        {listing && listing.categories.length > 0 && (
          <nav
            aria-label="Categories"
            className="-mx-4 -my-1 flex gap-2 overflow-x-auto px-4 py-1 md:mx-0 md:my-0 md:flex-wrap md:justify-center md:overflow-visible md:px-0 md:py-0"
          >
            <Link
              aria-current={query.category ? undefined : "page"}
              className={chipClass(!query.category)}
              href={listingHref({ q: query.q })}
            >
              All
            </Link>
            {listing.categories.map((category) => {
              const selected = category.toLowerCase() === chosen;
              return (
                <Link
                  aria-current={selected ? "page" : undefined}
                  className={chipClass(selected)}
                  href={listingHref({ q: query.q, category })}
                  key={category}
                >
                  {category}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      {/* After the intro, so the page's h1 comes first in the document. */}
      <h2 className="sr-only" id="businesses-heading">
        Businesses
      </h2>

      {listing && listing.items.length === 0 && (
        <p className="text-foreground">
          {emptyMessage(filtered, listing.page)}
        </p>
      )}

      {listing && listing.items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
          {listing.items.map((card, index) => (
            <li
              className={index === 0 ? "col-span-2 md:col-span-1" : undefined}
              key={card.slug}
            >
              <BusinessCard card={card} first={index === 0} />
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
  );
}
