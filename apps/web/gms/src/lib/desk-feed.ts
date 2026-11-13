import type { PublicPublishedProduct } from "@barrelsgd/api-client";
import {
  ISSUE_TIMES,
  isCurrentProduct,
  isForecastKind,
  isProductKind,
  nextClimateIssue,
  type ProductKind,
  productTitle,
  withForecastSchedule,
} from "@barrelsgd/gms/products";
import { postedLabel } from "@/lib/clock";
import type { PublishedContent } from "@/lib/cms";
import { photoCredit } from "@/lib/photo-credit";
import { STOCK_PICTURES } from "@/lib/stock-pictures";
import type { WarningLevel } from "@/lib/warning-level";

/**
 * A picture on an official card: the image of the pinned desk post that is
 * based on that product (owner, 5 Nov 2026), else the card type's standard
 * photo (owner, 10 Nov 2026), so no official card shows an empty picture.
 */
export interface CardPicture {
  alt: string;
  credit: string;
  src: string;
}

/** An issued GMS product shown as an official card in From the Desk. */
export interface OfficialCard {
  href: string;
  id: string;
  issued: string;
  kind: "briefing" | "outlook" | "marine" | "climate";
  picture: CardPicture | null;
  /**
   * Set only when the product is no longer current (the API normally omits
   * those). An expired briefing reads "Expired <time> · next forecast due <time>".
   */
  staleNote: string | null;
  summary: string;
  title: string;
  valid: string;
}

export interface DeskFeed {
  /**
   * Desk posts behind "Earlier posts": under a red (take action) warning, the
   * ones older than the warning's issue time (owner, 5 Nov 2026).
   */
  earlierPosts: PublishedContent[];
  /**
   * When the products feed answered but no public forecast is in effect (the
   * API leaves out expired ones): "The next forecast is due at 12:00 p.m."
   */
  missingBriefing: string | null;
  official: OfficialCard[];
  /** Desk posts shown in the row, newest first (pinned posts lead). */
  posts: PublishedContent[];
}

const MAX_POSTS = 8;
/** Only the newest three pinned posts lead; any further pins sort by date. */
const MAX_PINNED_POSTS = 3;
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
export function nextForecastDue(
  now: Date,
  kinds: readonly ProductKind[] = FORECAST_KINDS
): string {
  const times = kinds.flatMap((kind) => ISSUE_TIMES[kind] ?? []).sort();
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

/**
 * An expired forecast's note: when it expired and when the next one is due. The
 * Marine Forecast passes its own kind, because its next issue is 05:00, not
 * the land forecast times.
 */
function expiredBriefingNote(
  expiredAt: string | null,
  now: Date,
  kinds?: readonly ProductKind[]
): string {
  const expired = expiredAt ? `Expired ${expiredAt}` : "Expired";
  return `${expired} · next forecast due ${nextForecastDue(now, kinds)}`;
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

/** A desk post's time (publish, else last update), for ordering and the red-warning split. */
function postTime(post: PublishedContent): number {
  return Date.parse(post.publishedAt ?? post.updatedAt);
}

/**
 * The picture for a product's official card: the newest pinned desk post based
 * on that product that has an image. Only desk updates count, not report
 * write-ups.
 */
function pictureFor(
  productId: string,
  posts: PublishedContent[],
  kind: OfficialCard["kind"]
): CardPicture {
  const post = posts
    .filter(
      (item) =>
        item.collection === "desk-updates" &&
        item.pinned === true &&
        item.basedOn?.productId === productId &&
        item.imageUrl
    )
    .sort((a, b) => postTime(b) - postTime(a))[0];
  if (!post?.imageUrl) return STOCK_PICTURES[kind];
  return {
    alt: post.imageAlt ?? "",
    credit: photoCredit(post.imageCredit),
    src: post.imageUrl,
  };
}

function officialCard(
  product: PublicPublishedProduct,
  kind: OfficialCard["kind"],
  now: Date,
  picture: CardPicture | null
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
    {
      briefing: values.summary,
      outlook: values.systems ?? values.formation,
      marine: values.synopsis,
      // The first of these that the issue has reads as the card's paragraph;
      // `summary` is the first-version field of older Climate Bulletins.
      climate:
        values.precipOutlook ||
        values.droughtOutlook ||
        values.generalImplications ||
        values.summary,
    }[kind] ?? "";
  let staleNote: string | null = null;
  if (!current) {
    if (kind === "briefing") {
      staleNote = expiredBriefingNote(validTo, now);
    } else if (kind === "marine") {
      staleNote = expiredBriefingNote(validTo, now, ["marine-forecast"]);
    } else {
      staleNote = "No longer in effect";
    }
  }
  return {
    staleNote,
    href: `/weather/issued/${product.id}`,
    id: product.id,
    issued: `Issued ${localLabel(values.issuedAt, now) ?? postedLabel(product.publishedAt, now)}`,
    kind,
    picture,
    summary: summary.trim(),
    title: productTitle(product.kind),
    valid: cardValidity(kind, values, validTo),
  };
}

function cardValidity(
  kind: OfficialCard["kind"],
  values: Record<string, string>,
  validTo: string | null
) {
  if (kind === "climate") return nextIssueLabel(values.issuedAt);
  return validTo ? `Valid until ${validTo}` : (values.validity ?? "");
}

/** "Next issue 15 December" for a Climate Bulletin issued on `issuedAt` (Grenada local). */
export function nextIssueLabel(issuedAt: string | undefined): string {
  const day = (issuedAt ?? "").slice(0, 10);
  // Only claim a next issue when this one followed the monthly schedule.
  if (!day.endsWith("-15"))
    return day ? "Issued outside the monthly schedule" : "";
  const next = nextClimateIssue(
    day
      ? new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000)
          .toISOString()
          .slice(0, 10)
      : ""
  );
  if (!next) return "";
  const label = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(Date.parse(`${next}T12:00:00Z`));
  return `Next issue ${label}`;
}

/**
 * The From the Desk feed (homepage v2, owner 1 Nov 2026): the latest public
 * forecast (by issue time) pinned first, then the latest Marine Forecast,
 * Tropical Weather Outlook and Climate Bulletin (owner, 5 Nov 2026), then up to
 * three pinned desk posts, then the other desk posts and report write-ups newest
 * first. Official cards always lead. Under a red ("take action") warning, desk
 * posts older than the warning's issue time wait behind "Earlier posts"; newer
 * ones stay in the row. With the issue time unknown, every desk post waits.
 */
export function buildDeskFeed({
  level,
  now = new Date(),
  posts,
  products,
  productsAvailable = true,
  warningIssuedAt = null,
}: {
  level: WarningLevel;
  now?: Date;
  posts: PublishedContent[];
  products: PublicPublishedProduct[];
  /** False when the products feed failed; then nothing is said about forecasts here. */
  productsAvailable?: boolean;
  /**
   * When the earliest take-action warning in effect was issued (epoch ms), or
   * null when it is unknown. Only read under a take-action level.
   */
  warningIssuedAt?: number | null;
}): DeskFeed {
  const briefing = newest(
    products.filter((product) =>
      isProductKind(product.kind) ? isForecastKind(product.kind) : false
    ),
    FORECAST_KINDS
  );
  const marine = newest(products, ["marine-forecast"]);
  const outlook = newest(products, ["outlook"]);
  const climate = newest(products, ["climate-bulletin"]);
  const official = [
    briefing &&
      officialCard(
        briefing,
        "briefing",
        now,
        pictureFor(briefing.id, posts, "briefing")
      ),
    marine &&
      officialCard(
        marine,
        "marine",
        now,
        pictureFor(marine.id, posts, "marine")
      ),
    outlook &&
      officialCard(
        outlook,
        "outlook",
        now,
        pictureFor(outlook.id, posts, "outlook")
      ),
    climate &&
      officialCard(
        climate,
        "climate",
        now,
        pictureFor(climate.id, posts, "climate")
      ),
  ].filter((card): card is OfficialCard => Boolean(card));
  // Up to three pinned posts lead the desk posts (owner, 1 Nov 2026), newest
  // first; any further pinned posts sort with the rest by date.
  const newestFirst = [...posts].sort((a, b) => postTime(b) - postTime(a));
  const leading = newestFirst
    .filter((post) => post.pinned === true)
    .slice(0, MAX_PINNED_POSTS);
  const sorted = [
    ...leading,
    ...newestFirst.filter((post) => !leading.includes(post)),
  ].slice(0, MAX_POSTS);
  const behindWarning = (post: PublishedContent) =>
    level === "take-action" &&
    (warningIssuedAt === null || postTime(post) < warningIssuedAt);
  return {
    earlierPosts: sorted.filter(behindWarning),
    missingBriefing:
      productsAvailable && !briefing ? noForecastNote(now) : null,
    official,
    posts: sorted.filter((post) => !behindWarning(post)),
  };
}
