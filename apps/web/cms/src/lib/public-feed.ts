import type { CollectionConfig, Field, Payload, Where } from "payload";
import { DeskUpdates } from "../collections/desk-updates";
import { ReportNotes } from "../collections/report-notes";
import { Stories } from "../collections/stories";
import { NOTE_KIND } from "./duty-note";
import { type EditorialLink, editorialLinksSchema } from "./editorial-links";
import { bodyToText } from "./lexical";
import { isOnSite, liveWhere } from "./publication-window";

export const ARTICLE_COLLECTIONS = {
  "desk-updates": DeskUpdates,
  stories: Stories,
  "report-notes": ReportNotes,
} as const;
export type ArticleCollection = keyof typeof ARTICLE_COLLECTIONS;
export const isArticleCollection = (
  value: string | null
): value is ArticleCollection => Boolean(value && value in ARTICLE_COLLECTIONS);

/** The field that names each collection's category. */
const CATEGORY_FIELD: Record<ArticleCollection, string> = {
  "desk-updates": "kind",
  stories: "kind",
  "report-notes": "kind",
};

function flatFields(fields: Field[]): Field[] {
  return fields.flatMap((field) =>
    field.type === "row" ? flatFields(field.fields) : [field]
  );
}

/** The editor-facing label of a select value, read from the schema itself. */
export function optionLabel(
  config: CollectionConfig,
  name: string,
  value: unknown
): string | null {
  if (typeof value !== "string") return null;
  const field = flatFields(config.fields).find(
    (item) => "name" in item && item.name === name
  );
  if (field?.type !== "select") return null;
  const option = field.options.find((item) =>
    typeof item === "string" ? item === value : item.value === value
  );
  if (!option) return null;
  return typeof option === "string" ? option : String(option.label);
}

type Doc = Record<string, unknown>;
const upload = (value: unknown) =>
  value && typeof value === "object" ? (value as Doc) : null;

/**
 * The issued product a post features, from its main related link. Kept for
 * older site builds that read one product per post; the figures are never
 * stored here.
 */
export function toLinkedProduct(links: EditorialLink[]) {
  const main = links.find((link) => link.type === "product" && link.isMain);
  return main?.ref
    ? { productId: main.ref, kind: null, title: main.title }
    : null;
}

/** Public shape of one published article; never staff or workflow fields. */
export function toArticle(collection: ArticleCollection, doc: Doc) {
  const config = ARTICLE_COLLECTIONS[collection];
  const image = upload(doc.image);
  const relatedLinks = editorialLinksSchema.parse(doc.relatedLinks ?? []);
  return {
    id: String(doc.id),
    collection,
    title: String(doc.title),
    slug: String(doc.slug),
    kicker: (doc.kicker as string | undefined) ?? null,
    category: optionLabel(
      config,
      CATEGORY_FIELD[collection],
      doc[CATEGORY_FIELD[collection]]
    ),
    summary: (doc.summary as string | undefined) ?? null,
    authorName: (doc.authorName as string | undefined) ?? null,
    body: bodyToText(doc.body),
    imageUrl: (image?.url as string | undefined) ?? null,
    imageAlt: (image?.alt as string | undefined) ?? null,
    imageCredit: (image?.credit as string | undefined) ?? null,
    imageCaption: (doc.imageCaption as string | undefined) ?? null,
    topics: Array.isArray(doc.topics) ? (doc.topics as string[]) : [],
    publishedAt: (doc.publishedAt as string | undefined) ?? null,
    updatedAt: String(doc.updatedAt),
    relatedLinks,
    linkedProduct: toLinkedProduct(relatedLinks),
  };
}
export type PublicArticle = ReturnType<typeof toArticle>;

/** Published articles, newest first, read with public access rules. */
export async function findArticles(
  payload: Payload,
  collection: ArticleCollection,
  {
    limit = 20,
    now = new Date(),
    slug,
  }: { limit?: number; now?: Date; slug?: string } = {}
): Promise<PublicArticle[]> {
  const result = await payload.find({
    collection,
    overrideAccess: false,
    depth: 1,
    limit: slug ? 1 : limit,
    sort: "-publishedAt",
    where: liveWhere(now, ...(slug ? [{ slug: { equals: slug } }] : [])),
  });
  return result.docs.map((doc) => toArticle(collection, doc as unknown as Doc));
}

/** Public shape of one Weather now live post. */
export function toLivePost(doc: Doc) {
  const kind = String(doc.kind);
  return {
    id: String(doc.id),
    kind,
    title: String(doc.title),
    text: (doc.text as string | undefined) || null,
    mediaUrl:
      kind === "video" || kind === "audio"
        ? (doc.mediaUrl as string | undefined) || null
        : null,
    publishedAt: (doc.publishedAt as string | undefined) ?? null,
    expiresAt: (doc.expiresAt as string | undefined) ?? null,
    relatedLinks: editorialLinksSchema.parse(doc.relatedLinks ?? []),
  };
}
export type PublicLivePost = ReturnType<typeof toLivePost>;

/** Weather now: the general update, one per imagery tab, then video and audio. */
export const LIVE_POST_KINDS = [
  "update",
  "satellite",
  "radar",
  "wind",
  "seas",
  "video",
  "audio",
] as const;

/** Newest published live posts of one kind that have not expired. */
export async function findLivePosts(
  payload: Payload,
  {
    kind,
    limit = 5,
    now = new Date(),
  }: { kind: (typeof LIVE_POST_KINDS)[number]; limit?: number; now?: Date }
): Promise<PublicLivePost[]> {
  const result = await payload.find({
    collection: "live-posts",
    overrideAccess: false,
    depth: 0,
    limit,
    sort: "-publishedAt",
    where: liveWhere(now, { kind: { equals: kind } }, unexpired(now)),
  });
  return result.docs.map((doc) => toLivePost(doc as unknown as Doc));
}

export const NO_STORE = { "Cache-Control": "no-store" };

const LINKED_HREF_COLLECTIONS = new Set(["questions", "stories"]);

/** Public shape of one published question. */
export function toQuestion(doc: Doc) {
  const related = Array.isArray(doc.related) ? (doc.related as Doc[]) : [];
  const check = (doc.scienceCheck ?? {}) as Doc;
  return {
    id: String(doc.id),
    question: String(doc.question),
    slug: String(doc.slug),
    shortAnswer: String(doc.shortAnswer),
    body: bodyToText(doc.body),
    topics: Array.isArray(doc.topics) ? (doc.topics as string[]) : [],
    checkedAt: check.checked
      ? ((check.checkedAt as string | undefined) ?? null)
      : null,
    publishedAt: (doc.publishedAt as string | undefined) ?? null,
    updatedAt: String(doc.updatedAt),
    relatedLinks: editorialLinksSchema.parse(doc.relatedLinks ?? []),
    // Only related items the public can read arrive populated.
    related: related.flatMap((item) => {
      const link = toRelated(item);
      return link ? [link] : [];
    }),
  };
}

/** A populated polymorphic link, or null unless the public can read it. */
export function toRelated(item: unknown) {
  if (!item || typeof item !== "object") return null;
  const value = upload((item as Doc).value);
  const collection = String((item as Doc).relationTo);
  if (
    !(
      value &&
      LINKED_HREF_COLLECTIONS.has(collection) &&
      isOnSite(value as Parameters<typeof isOnSite>[0])
    )
  )
    return null;
  return {
    collection,
    title: String(value.title ?? value.question),
    slug: String(value.slug),
  };
}
export type PublicQuestion = ReturnType<typeof toQuestion>;

export async function findQuestions(
  payload: Payload,
  {
    limit = 50,
    now = new Date(),
    slug,
    topic,
  }: { limit?: number; now?: Date; slug?: string; topic?: string } = {}
): Promise<PublicQuestion[]> {
  const result = await payload.find({
    collection: "questions",
    overrideAccess: false,
    depth: 1,
    limit: slug ? 1 : limit,
    sort: "-publishedAt",
    where: liveWhere(
      now,
      ...(slug ? [{ slug: { equals: slug } }] : []),
      ...(topic ? [{ topics: { contains: topic } }] : [])
    ),
  });
  return result.docs.map((doc) => toQuestion(doc as unknown as Doc));
}

/** Expiry rule shared by notes and live posts: none set, or one still ahead. */
const unexpired = (now: Date): Where => ({
  or: [
    { expiresAt: { exists: false } },
    { expiresAt: { greater_than: now.toISOString() } },
  ],
});

/**
 * The duty forecaster's note: the newest published live post of kind note
 * that is on the site and unexpired. Its CAP alert link comes with it as
 * `alertUrl` (for site builds that predate related links) and as
 * `relatedLinks`. Imagery is FastAPI's.
 */
export async function findWeatherNow(payload: Payload, now: Date = new Date()) {
  const result = await payload.find({
    collection: "live-posts",
    overrideAccess: false,
    depth: 0,
    limit: 1,
    sort: "-publishedAt",
    // A note without an expiry never shows, as before; it always has one when posted.
    where: liveWhere(now, {
      kind: { equals: NOTE_KIND },
      expiresAt: { greater_than: now.toISOString() },
    }),
  });
  const doc = result.docs[0] as unknown as Doc | undefined;
  if (!(doc && typeof doc.text === "string" && doc.text.trim() !== ""))
    return { note: null };
  const relatedLinks = editorialLinksSchema.parse(doc.relatedLinks ?? []);
  return {
    note: {
      text: doc.text,
      postedAt: (doc.publishedAt as string | undefined) ?? null,
      expiresAt: String(doc.expiresAt),
      alertUrl: relatedLinks.find((link) => link.type === "cap")?.url ?? null,
      relatedLinks,
    },
  };
}
export type PublicWeatherNow = Awaited<ReturnType<typeof findWeatherNow>>;

/** Homepage settings: which sections are hidden, plus the posts marked to lead. */
export async function findHomepage(payload: Payload, now: Date = new Date()) {
  const global = (await payload.findGlobal({
    slug: "homepage",
    depth: 0,
    overrideAccess: false,
  })) as unknown as Doc;
  const [lead, featured] = await Promise.all([
    payload.find({
      collection: "stories",
      depth: 1,
      limit: 1,
      overrideAccess: false,
      sort: "-publishedAt",
      where: liveWhere(now, { leadOnHomepage: { equals: true } }),
    }),
    // Numbered questions first (1 = first), then the rest of the flagged ones.
    payload.find({
      collection: "questions",
      depth: 1,
      limit: 5,
      overrideAccess: false,
      sort: ["featuredOrder", "-publishedAt"],
      where: liveWhere(now, { featured: { equals: true } }),
    }),
  ]);
  return {
    leadStory: (lead.docs[0] as unknown as Doc | undefined) ?? null,
    featuredQuestions: featured.docs as unknown as Doc[],
    discoverCards: ["sky", "on-this-day", "quiz", "fact"],
    hiddenSections: Array.isArray(global.hiddenSections)
      ? (global.hiddenSections as string[])
      : [],
    exploreReading: {},
    sectionCopy: {},
  };
}

/** Pinned items first, in order, then the newest; no duplicates. */
export function withPins<T extends { id: string }>(
  pinned: T[],
  newest: T[],
  limit: number
): T[] {
  const seen = new Set(pinned.map((item) => item.id));
  return [...pinned, ...newest.filter((item) => !seen.has(item.id))].slice(
    0,
    limit
  );
}

const GRENADA_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Grenada",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in Grenada as numbers and as `YYYY-MM-DD`. */
export function grenadaToday(now: Date) {
  const iso = GRENADA_DATE.format(now);
  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = iso
    .split("-")
    .map(Number);
  return { iso, year, month, day };
}

/** Day of the year in a non-leap year, so 29 Feb shares 1 Mar's slot. */
const dayOfYear = (month: number, day: number) =>
  Math.round(
    (Date.UTC(2001, month - 1, Math.min(day, 28 + (month === 2 ? 0 : 3))) -
      Date.UTC(2001, 0, 1)) /
      86_400_000
  );

/** Days between two calendar days, wrapping round the year end. */
export function daysApart(
  a: { month: number; day: number },
  b: { month: number; day: number }
) {
  const gap = Math.abs(dayOfYear(a.month, a.day) - dayOfYear(b.month, b.day));
  return Math.min(gap, 365 - gap);
}

/** Today's entry, or the nearest within a week; the exact day wins ties. */
export function pickOnThisDay<T extends { day: number; month: number }>(
  entries: T[],
  today: { month: number; day: number },
  window = 7
): T | null {
  let best: T | null = null;
  let bestGap = window + 1;
  for (const entry of entries) {
    const gap = daysApart(entry, today);
    if (gap < bestGap) {
      best = entry;
      bestGap = gap;
    }
  }
  return best;
}

/** One fact per Grenada day, cycling through them in a stable order. */
export function pickDaily<T>(
  items: T[],
  today: { year: number; month: number; day: number }
) {
  if (items.length === 0) return null;
  const days = Math.floor(
    Date.UTC(today.year, today.month - 1, today.day) / 86_400_000
  );
  return items[days % items.length] ?? null;
}

async function publishedDiscover(payload: Payload, type: string, now: Date) {
  const result = await payload.find({
    collection: "discover",
    overrideAccess: false,
    depth: 1,
    limit: 400,
    sort: "createdAt",
    where: liveWhere(now, { type: { equals: type } }),
  });
  return result.docs as unknown as Doc[];
}

export function toQuiz(doc: Doc) {
  const questions = Array.isArray(doc.questions)
    ? (doc.questions as Doc[])
    : [];
  return {
    title: String(doc.title),
    slug: String(doc.slug),
    intro: (doc.intro as string | undefined) ?? null,
    questions: questions.map((row) => ({
      prompt: String(row.prompt),
      options: (Array.isArray(row.options) ? (row.options as Doc[]) : []).map(
        (option) => String(option.text)
      ),
      answer: Number(row.correct) - 1,
      explanation: String(row.explanation),
    })),
  };
}
export type PublicQuiz = ReturnType<typeof toQuiz>;

/** What the homepage's Discover section shows today. */
export async function findDiscover(payload: Payload, now: Date = new Date()) {
  const today = grenadaToday(now);
  const [history, quizzes, facts, notes] = await Promise.all([
    publishedDiscover(payload, "on-this-day", now),
    payload.find({
      collection: "discover",
      overrideAccess: false,
      depth: 0,
      limit: 1,
      sort: "-publishedAt",
      where: liveWhere(now, { type: { equals: "quiz" } }),
    }),
    publishedDiscover(payload, "fact", now),
    publishedDiscover(payload, "sky-note", now),
  ]);
  const entry = pickOnThisDay(
    history.map((doc) => ({
      doc,
      day: Number(doc.day),
      month: Number(doc.month),
    })),
    today
  )?.doc;
  const story = upload(entry?.story);
  const quiz = quizzes.docs[0] as unknown as Doc | undefined;
  const fact = pickDaily(facts, today);
  const note = notes.find(
    (doc) =>
      String(doc.startsOn).slice(0, 10) <= today.iso &&
      String(doc.endsOn).slice(0, 10) >= today.iso
  );
  return {
    today: today.iso,
    onThisDay: entry
      ? {
          title: String(entry.title),
          day: Number(entry.day),
          month: Number(entry.month),
          year: Number(entry.year),
          whatHappened: String(entry.whatHappened),
          imageUrl: (upload(entry.image)?.url as string | undefined) ?? null,
          story:
            story && story.status === "published"
              ? { title: String(story.title), slug: String(story.slug) }
              : null,
        }
      : null,
    quiz: quiz
      ? {
          title: String(quiz.title),
          slug: String(quiz.slug),
          intro: (quiz.intro as string | undefined) ?? null,
          questionCount: Array.isArray(quiz.questions)
            ? quiz.questions.length
            : 0,
        }
      : null,
    fact: fact
      ? {
          title: String(fact.title),
          fact: String(fact.fact),
          source: String(fact.source),
          sourceUrl: (fact.sourceUrl as string | undefined) || null,
        }
      : null,
    skyNote: note
      ? { title: String(note.title), note: String(note.note) }
      : null,
  };
}
export type PublicDiscover = Awaited<ReturnType<typeof findDiscover>>;

/** Published quizzes, newest first, or one by slug with its questions. */
export async function findQuizzes(
  payload: Payload,
  slug?: string,
  now: Date = new Date()
) {
  const result = await payload.find({
    collection: "discover",
    overrideAccess: false,
    depth: 0,
    limit: slug ? 1 : 50,
    sort: "-publishedAt",
    where: liveWhere(
      now,
      { type: { equals: "quiz" } },
      ...(slug ? [{ slug: { equals: slug } }] : [])
    ),
  });
  return result.docs.map((doc) => toQuiz(doc as unknown as Doc));
}
