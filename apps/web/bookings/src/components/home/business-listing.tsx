import type {
  BookingPublicBusiness,
  BookingPublicBusinessPage,
} from "@barrelsgd/api-client";
import Image from "next/image";
import Link from "next/link";
import { pageAccent } from "@/lib/brand-colour";
import type { ListingQuery } from "@/lib/business-listing-query";
import { safeLogoUrl } from "@/lib/storefront-brand";

// Server rendered: the search is a plain GET form and the chips and pages are
// links, so the list works before any script loads. Every link is 44 px tall.
const LINK =
  "inline-flex min-h-11 items-center font-medium underline underline-offset-4";
const CHIP =
  "inline-flex min-h-11 shrink-0 items-center rounded-full bg-background px-4 text-sm font-medium shadow-xs";
const CHIP_CHOSEN = "bg-primary text-primary-foreground";
const CARD =
  "bg-background text-foreground rounded-3xl shadow-xs focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

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

/** Initial shown when a business has no logo. */
function firstLetter(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}

function BusinessCard({
  card,
  large = false,
}: Readonly<{ card: BookingPublicBusiness; large?: boolean }>) {
  const logo = safeLogoUrl(card.logo_url);
  const accent = pageAccent(card.brand_color);
  const where = [card.category, card.city].filter(Boolean).join(" · ");
  // The tile is a light tint of the brand colour with ink text, so the letter
  // reads at 4.5:1 whatever colour the business picked.
  const tileStyle = accent
    ? { backgroundColor: `color-mix(in srgb, ${accent} 18%, white)` }
    : undefined;
  return (
    <Link
      className={`${CARD} ${large ? "flex-col gap-4 p-5 sm:flex-row sm:items-center" : "flex-col gap-3 p-4"} flex h-full`}
      href={{ pathname: `/${card.slug}` }}
    >
      <span
        aria-hidden="true"
        className={`${large ? "size-20" : "size-14"} bg-ground text-foreground flex shrink-0 items-center justify-center overflow-hidden rounded-2xl text-2xl font-bold`}
        style={tileStyle}
      >
        {logo ? (
          <Image
            alt=""
            className="size-full object-contain p-2"
            height={80}
            referrerPolicy="no-referrer"
            src={logo}
            unoptimized
            width={80}
          />
        ) : (
          firstLetter(card.name)
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="text-base font-semibold">{card.name}</h3>
        {where && (
          <span className="text-muted-foreground text-sm">{where}</span>
        )}
        {large && card.short_description && (
          <span className="text-sm">{card.short_description}</span>
        )}
      </span>
      {large && (
        <span
          aria-hidden="true"
          className="bg-primary text-primary-foreground inline-flex min-h-11 items-center justify-center self-start rounded-full px-6 text-sm font-semibold sm:self-center"
        >
          Book
        </span>
      )}
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
}: Readonly<{
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
      <h2 className="sr-only" id="businesses-heading">
        Businesses
      </h2>

      <search>
        <form
          action="/"
          className="bg-background focus-within:ring-ring flex min-h-13 items-center gap-2 rounded-full pr-1.5 pl-5 shadow-xs focus-within:ring-2"
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
        <p className="text-muted-foreground" role="alert">
          Businesses cannot be loaded right now. Try again in a few minutes.
        </p>
      )}

      {listing && listing.categories.length === 0 && (
        <nav aria-label="Categories">
          <p className="text-muted-foreground text-sm">No categories yet.</p>
        </nav>
      )}

      {listing && listing.categories.length > 0 && (
        <nav
          aria-label="Categories"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
        >
          <Link
            aria-current={query.category ? undefined : "page"}
            className={`${CHIP} ${query.category ? "" : CHIP_CHOSEN}`}
            href={listingHref({ q: query.q })}
          >
            All
          </Link>
          {listing.categories.map((category) => {
            const selected = category.toLowerCase() === chosen;
            return (
              <Link
                aria-current={selected ? "page" : undefined}
                className={`${CHIP} ${selected ? CHIP_CHOSEN : ""}`}
                href={listingHref({ q: query.q, category })}
                key={category}
              >
                {category}
              </Link>
            );
          })}
        </nav>
      )}

      {listing && listing.items.length === 0 && (
        <p className="text-muted-foreground">
          {emptyMessage(filtered, listing.page)}
        </p>
      )}

      {listing && listing.items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {listing.items.map((card, index) =>
            index === 0 ? (
              <li key={card.slug}>
                <BusinessCard card={card} large />
              </li>
            ) : null
          )}
          {listing.items.length > 1 && (
            <li>
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                {listing.items.slice(1).map((card) => (
                  <li key={card.slug}>
                    <BusinessCard card={card} />
                  </li>
                ))}
              </ul>
            </li>
          )}
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
