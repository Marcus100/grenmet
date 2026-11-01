import type { PublicPublishedProduct } from "@barrelsgd/api-client";
import {
  ISSUE_TIMES,
  isCurrentProduct,
  isForecastKind,
  isProductKind,
  type ProductKind,
  productTitle,
  withForecastSchedule,
} from "@barrelsgd/gms/products";
import { postedLabel } from "@/lib/clock";
import type { PublishedContent } from "@/lib/cms";
import type { WarningLevel } from "@/lib/warning-level";

/** An issued GMS product shown as an official card in From the Desk. */
export interface OfficialCard {
  href: string;
  id: string;
  issued: string;
  kind: "briefing" | "outlook";
  /** Set only when the product is no longer current (the API normally omits those). */
  staleNote: string | null;
  summary: string;
  title: string;
  valid: string;
}

export interface DeskFeed {
  /** Under a red warning desk posts wait behind "Earlier posts" (owner, 1 Nov 2026). */
  collapsePosts: boolean;
  /**
   * When the products feed answered but no public forecast is in effect (the
   * API leaves out expired ones): "The next forecast is due at 12:00 p.m."
   */
  missingBriefing: string | null;
  official: OfficialCard[];
  posts: PublishedContent[];
}

const MAX_POSTS = 8;
const FORECAST_KINDS: readonly ProductKind[] = ["morning", "midday", "evening"];

/** A product's local "YYYY-MM-DDTHH:mm" (Grenada) as a posted-style label. */
function localLabel(value: string | undefined, now: Date): string | null {
  if (!value) return null;
  const time = Date.parse(`${value}:00-04:00`);
  return Number.isFinite(time)
    ? postedLabel(new Date(time).toISOString(), now)
    : null;
}

const clock = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const suffix = hours < 12 ? "a.m." : "p.m.";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
};

/**
 * When the next public forecast is due, in Grenada time: "12:00 p.m.",
 * "7:00 a.m. tomorrow", or within the hour after an issue time "now (the
 * 7:00 a.m. forecast)", because that one is being prepared.
 */
export function nextForecastDue(now: Date): string {
  const times = FORECAST_KINDS.flatMap(
    (kind) => ISSUE_TIMES[kind] ?? []
  ).sort();
  const local = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const minutesNow = local.getUTCHours() * 60 + local.getUTCMinutes();
  const minutesOf = (time: string) => {
    const [h = 0, m = 0] = time.split(":").map(Number);
    return h * 60 + m;
  };
  const due = times.find(
    (time) => minutesNow >= minutesOf(time) && minutesNow < minutesOf(time) + 60
  );
  if (due) return `now (the ${clock(due)} forecast)`;
  const next = times.find((time) => minutesOf(time) > minutesNow);
  return next ? clock(next) : `${clock(times[0] ?? "07:00")} tomorrow`;
}

/** The placeholder briefing's words; "p.m." already ends the sentence. */
function noForecastNote(now: Date): string {
  const due = nextForecastDue(now);
  return `No public forecast is in effect right now. The next forecast is due ${due}${due.endsWith(".") ? "" : "."}`;
}

/** A product's issue time (Grenada local), falling back to its publish time. */
function issuedTime(product: PublicPublishedProduct): number {
  const issued = product.values.issuedAt;
  const time = issued ? Date.parse(`${issued}:00-04:00`) : Number.NaN;
  return Number.isFinite(time) ? time : Date.parse(product.publishedAt);
}

function newest(products: PublicPublishedProduct[], kinds: readonly string[]) {
  return products
    .filter((product) => kinds.includes(product.kind))
    .sort((a, b) => issuedTime(b) - issuedTime(a))[0];
}

function officialCard(
  product: PublicPublishedProduct,
  kind: OfficialCard["kind"],
  now: Date
): OfficialCard | null {
  if (!isProductKind(product.kind)) return null;
  const values = withForecastSchedule(product.kind, product.values);
  const current = isCurrentProduct(
    {
      id: product.id,
      kind: product.kind,
      values,
      publishedAt: product.publishedAt,
      revision: product.revision,
    },
    now.getTime()
  );
  const validTo = localLabel(values.validTo, now);
  const summary =
    (kind === "briefing"
      ? values.summary
      : (values.systems ?? values.formation)) ?? "";
  return {
    staleNote: current ? null : "No longer in effect",
    href: `/weather/issued/${product.id}`,
    id: product.id,
    issued: `Issued ${localLabel(values.issuedAt, now) ?? postedLabel(product.publishedAt, now)}`,
    kind,
    summary: summary.trim(),
    title: productTitle(product.kind),
    valid: validTo ? `Valid until ${validTo}` : (values.validity ?? ""),
  };
}

/**
 * The From the Desk feed (homepage v2, owner 1 Nov 2026): the latest public
 * forecast (by issue time) pinned first and the latest Tropical Weather Outlook, then desk
 * posts and report write-ups newest first. Official cards always lead; under
 * a red ("take action") warning the desk posts wait behind "Earlier posts".
 */
export function buildDeskFeed({
  level,
  now = new Date(),
  posts,
  products,
  productsAvailable = true,
}: {
  level: WarningLevel;
  now?: Date;
  posts: PublishedContent[];
  products: PublicPublishedProduct[];
  /** False when the products feed failed; then nothing is said about forecasts here. */
  productsAvailable?: boolean;
}): DeskFeed {
  const briefing = newest(
    products.filter((product) =>
      isProductKind(product.kind) ? isForecastKind(product.kind) : false
    ),
    FORECAST_KINDS
  );
  const outlook = newest(products, ["outlook"]);
  const official = [
    briefing && officialCard(briefing, "briefing", now),
    outlook && officialCard(outlook, "outlook", now),
  ].filter((card): card is OfficialCard => Boolean(card));
  const sorted = [...posts]
    .sort(
      (a, b) =>
        Date.parse(b.publishedAt ?? b.updatedAt) -
        Date.parse(a.publishedAt ?? a.updatedAt)
    )
    .slice(0, MAX_POSTS);
  return {
    collapsePosts: level === "take-action",
    missingBriefing:
      productsAvailable && !briefing ? noForecastNote(now) : null,
    official,
    posts: sorted,
  };
}
