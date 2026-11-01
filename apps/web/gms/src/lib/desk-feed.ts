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
  /** "Expired 7:00 a.m. · next forecast due 12:00 p.m." when out of date. */
  expiredNote: string | null;
  href: string;
  id: string;
  issued: string;
  kind: "briefing" | "outlook";
  summary: string;
  title: string;
  valid: string;
}

export interface DeskFeed {
  /** Under a red warning desk posts wait behind "Earlier posts" (owner, 1 Nov 2026). */
  collapsePosts: boolean;
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

/** "12:00 p.m."-style label for the next scheduled public forecast. */
export function nextForecastDue(now: Date): string {
  const times = FORECAST_KINDS.flatMap(
    (kind) => ISSUE_TIMES[kind] ?? []
  ).sort();
  const local = new Date(now.getTime() - 4 * 60 * 60 * 1000)
    .toISOString()
    .slice(11, 16);
  const next = times.find((time) => time > local) ?? times[0] ?? "07:00";
  const [hours = 0, minutes = 0] = next.split(":").map(Number);
  const suffix = hours < 12 ? "a.m." : "p.m.";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const day = times.some((time) => time > local) ? "" : " tomorrow";
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}${day}`;
}

function newest(products: PublicPublishedProduct[], kinds: readonly string[]) {
  return products
    .filter((product) => kinds.includes(product.kind))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
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
    expiredNote:
      current || kind !== "briefing"
        ? null
        : `Expired${validTo ? ` ${validTo}` : ""} · next forecast due ${nextForecastDue(now)}`,
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
 * forecast pinned first and the latest Tropical Weather Outlook, then desk
 * posts and report write-ups newest first. Official cards always lead; under
 * a red ("take action") warning the desk posts wait behind "Earlier posts".
 */
export function buildDeskFeed({
  level,
  now = new Date(),
  posts,
  products,
}: {
  level: WarningLevel;
  now?: Date;
  posts: PublishedContent[];
  products: PublicPublishedProduct[];
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
  return { collapsePosts: level === "take-action", official, posts: sorted };
}
