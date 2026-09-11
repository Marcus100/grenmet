import {
  type ProductKind,
  type PublishedProduct,
  productTitle,
} from "@barrelsgd/gms/products";
import type { ImagesBySynoptic } from "@/db/wxwatch/queries";
import type { WeatherImage } from "@/db/wxwatch/schema";

/** Synoptic slots WxWatch collects per image source in a UTC day. */
export const SYNOPTIC_SLOTS = 8;

/** The products the desk is expected to issue every day. Bulletins are
 *  event-driven, so they are counted when live but never shown as "pending". */
export const DAILY_SCHEDULE: ProductKind[] = [
  "morning",
  "midday",
  "evening",
  "outlook",
];

export interface ScheduledProduct {
  href: string;
  issuedAt: string | null;
  kind: ProductKind;
  status: "issued" | "pending";
  title: string;
}

export interface ProductSummary {
  bulletins: PublishedProduct[];
  expected: number;
  issued: number;
  schedule: ScheduledProduct[];
}

const PRODUCT_HREF: Partial<Record<ProductKind, string>> = {
  morning: "/wxproducts/fcsts",
  midday: "/wxproducts/fcsts",
  evening: "/wxproducts/fcsts",
  outlook: "/wxproducts/nhc",
};

/** `issuedAt` is a local `YYYY-MM-DDTHH:mm` string authored on the desk, so the
 *  day is its date prefix — never a UTC conversion of the instant. */
export function issuedOn(product: PublishedProduct, isoDate: string): boolean {
  return (product.values.issuedAt ?? "").slice(0, 10) === isoDate;
}

/** Split today's published products into the scheduled daily suite (issued or
 *  still pending) and the event-driven bulletins that are currently live. */
export function summarizeProducts(
  published: PublishedProduct[],
  isoDate: string
): ProductSummary {
  const today = published.filter((product) => issuedOn(product, isoDate));

  const schedule = DAILY_SCHEDULE.map((kind) => {
    const match = today.find((product) => product.kind === kind);
    return {
      href: PRODUCT_HREF[kind] ?? "/wxproducts",
      issuedAt: match?.values.issuedAt ?? null,
      kind,
      status: match ? ("issued" as const) : ("pending" as const),
      title: productTitle(kind),
    };
  });

  return {
    bulletins: published.filter(
      (product) => !DAILY_SCHEDULE.includes(product.kind)
    ),
    expected: schedule.length,
    issued: schedule.filter((item) => item.status === "issued").length,
    schedule,
  };
}

export interface ImagerySummary {
  captured: number;
  expected: number;
  latest: WeatherImage | null;
  sources: number;
}

/** Coverage for the day: how many synoptic slots actually hold an image, and
 *  the most recent frame across every source. */
export function summarizeImagery(groups: ImagesBySynoptic): ImagerySummary {
  const images = groups.flatMap((group) =>
    Object.values(group.synopticImages).filter(
      (image): image is WeatherImage => image !== null
    )
  );

  const latest = images.reduce<WeatherImage | null>((newest, image) => {
    if (!image.observationTime) {
      return newest;
    }
    if (!newest?.observationTime) {
      return image;
    }
    return new Date(image.observationTime) > new Date(newest.observationTime)
      ? image
      : newest;
  }, null);

  return {
    captured: images.length,
    expected: groups.length * SYNOPTIC_SLOTS,
    latest,
    sources: groups.length,
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact age label for a timestamp — "just now", "12 min ago", "3 h ago". */
export function relativeTime(
  value: Date | string | null | undefined,
  now: number = Date.now()
): string {
  if (!value) {
    return "Unknown";
  }
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) {
    return "Unknown";
  }

  const elapsed = now - then;
  if (elapsed < 0) {
    return "Scheduled";
  }
  if (elapsed < MINUTE) {
    return "Just now";
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)} min ago`;
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)} h ago`;
  }
  return `${Math.floor(elapsed / DAY)} d ago`;
}

/** Today's date in the Grenada timezone as `YYYY-MM-DD` — the desk's calendar
 *  day, which is what product `issuedAt` values are authored against. */
export function grenadaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Grenada",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
