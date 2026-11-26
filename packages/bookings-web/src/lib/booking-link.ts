// The booking page's shareable choices: `?service=`, `?day=` and `?time=`.
// Pure functions, so the rules are unit-tested without a DOM. The host page
// reads the raw query with these; the flow writes the same keys back.

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/u;

/** The first value of a query parameter, when it is a string. */
function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** A `?day=YYYY-MM-DD` that is a real calendar day, else undefined. */
export function dayParam(
  value: string | string[] | undefined
): string | undefined {
  const text = single(value);
  if (text === undefined || !DAY_PATTERN.test(text)) {
    return undefined;
  }
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  return date.getUTCMonth() === (month ?? 1) - 1 &&
    date.getUTCDate() === (day ?? 1)
    ? text
    : undefined;
}

/** A `?time=` instant, as the API gives it (ISO 8601 with a zone), else undefined. */
export function timeParam(
  value: string | string[] | undefined
): string | undefined {
  const text = single(value);
  if (
    text === undefined ||
    !INSTANT_PATTERN.test(text) ||
    Number.isNaN(Date.parse(text))
  ) {
    return undefined;
  }
  return text;
}

export interface LinkChoices {
  day?: string | null;
  service?: string | null;
  time?: string | null;
}

/**
 * The page's URL with the choices written in. Other query parameters and the
 * hash are kept. A missing choice drops its parameter.
 */
export function withChoices(href: string, choices: LinkChoices): string {
  const url = new URL(href);
  const keys: Array<keyof LinkChoices> = ["service", "day", "time"];
  for (const key of keys) {
    const value = choices[key];
    if (value) {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}

/** Longer than the three lines the details panel shows before "Read more". */
const LONG_CHARACTERS = 180;
const LONG_LINES = 3;

/** True when a service description needs a "Read more" toggle to read in full. */
export function isLongDescription(text: string | null | undefined): boolean {
  if (!text) {
    return false;
  }
  return text.length > LONG_CHARACTERS || text.split("\n").length > LONG_LINES;
}
