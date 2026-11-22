import type {
  BookingPublicBusiness,
  BookingPublicBusinessPage,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
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
  "inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-medium";
const CHIP_CHOSEN = "border-primary bg-primary text-primary-foreground";

/** The home page address for a query; the page number is kept only past page 1. */
export function listingHref(query: Partial<ListingQuery>): string {
  const params = new URLSearchParams();
  if (query.q) {
    params.set("q", query.q);
  }
  if (query.category) {
    params.set("category", query.category);
  }
  if (query.page && query.page > 1) {
    params.set("page", String(query.page));
  }
  const text = params.toString();
  return text ? `/?${text}` : "/";
}

function BusinessCard({ card }: Readonly<{ card: BookingPublicBusiness }>) {
  const logo = safeLogoUrl(card.logo_url);
  const accent = pageAccent(card.brand_color);
  return (
    <article
      className="border-border flex h-full gap-4 rounded-lg border border-t-4 p-4"
      style={accent ? { borderTopColor: accent } : undefined}
    >
      {logo && (
        <Image
          alt=""
          className="size-12 shrink-0 rounded-md object-contain"
          height={48}
          referrerPolicy="no-referrer"
          src={logo}
          unoptimized
          width={48}
        />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="text-lg font-semibold">
          <Link className={LINK} href={`/${card.slug}`}>
            {card.name}
          </Link>
        </h3>
        {card.category && (
          <p className="text-muted-foreground text-sm">{card.category}</p>
        )}
        {card.short_description && <p>{card.short_description}</p>}
        {card.city && (
          <p className="text-muted-foreground text-sm">{card.city}</p>
        )}
      </div>
    </article>
  );
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
      <h2 className="text-lg font-semibold" id="businesses-heading">
        Businesses
      </h2>

      <search>
        <form
          action="/"
          className="flex flex-col gap-2 sm:flex-row"
          method="get"
        >
          <label className="sr-only" htmlFor="home-search">
            Search businesses
          </label>
          <Input
            className="min-h-11 flex-1"
            defaultValue={query.q ?? ""}
            id="home-search"
            maxLength={80}
            name="q"
            placeholder="Search by name, service or town"
            type="search"
          />
          {query.category && (
            <input name="category" type="hidden" value={query.category} />
          )}
          <Button className="min-h-11" type="submit">
            Search
          </Button>
        </form>
      </search>

      {listing === null && (
        <p className="text-muted-foreground" role="alert">
          Businesses cannot be loaded right now. Try again in a few minutes.
        </p>
      )}

      {listing && listing.categories.length > 0 && (
        <nav aria-label="Categories" className="flex flex-wrap gap-2">
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
          {filtered
            ? "No businesses match that search. Try another word or category."
            : "No businesses listed yet. Businesses appear here once they choose to be listed."}
        </p>
      )}

      {listing && listing.items.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {listing.items.map((card) => (
            <li key={card.slug}>
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
