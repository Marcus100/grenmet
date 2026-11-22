// The home page's address parameters (`?q=&category=&page=`) as the API takes
// them. Plain functions, shared by the page and its tests.

/** The API keeps a search and a category to 80 characters and 1 to 1000 pages. */
const MAX_TEXT = 80;
const MAX_PAGE = 1000;
const DIGITS = /^\d+$/u;

export interface ListingQuery {
  category: string | undefined;
  page: number;
  q: string | undefined;
}

type Raw = Record<string, string | string[] | undefined>;

function text(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim().slice(0, MAX_TEXT);
  return trimmed ? trimmed : undefined;
}

function page(value: string | string[] | undefined): number {
  const first = Array.isArray(value) ? value[0] : value;
  if (!(first && DIGITS.test(first))) {
    return 1;
  }
  const number = Number(first);
  return number >= 1 && number <= MAX_PAGE ? number : 1;
}

/** The listing query from the page's search parameters. Anything malformed falls back to none. */
export function listingQuery(params: Raw): ListingQuery {
  return {
    q: text(params.q),
    category: text(params.category),
    page: page(params.page),
  };
}
