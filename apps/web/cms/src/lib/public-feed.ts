import type { CollectionConfig, Field, Payload } from "payload";
import { DeskUpdates } from "../collections/desk-updates";
import { Publications } from "../collections/publications";
import { Stories } from "../collections/stories";
import { editorialLinksSchema } from "./editorial-links";
import { bodyToText } from "./lexical";

export const ARTICLE_COLLECTIONS = {
  "desk-updates": DeskUpdates,
  stories: Stories,
  publications: Publications,
} as const;
export type ArticleCollection = keyof typeof ARTICLE_COLLECTIONS;
export const isArticleCollection = (
  value: string | null
): value is ArticleCollection => Boolean(value && value in ARTICLE_COLLECTIONS);

/** The field that names each collection's category. */
const CATEGORY_FIELD: Record<ArticleCollection, string> = {
  "desk-updates": "kind",
  stories: "kind",
  publications: "type",
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

/** Public shape of one published article; never staff or workflow fields. */
export function toArticle(collection: ArticleCollection, doc: Doc) {
  const config = ARTICLE_COLLECTIONS[collection];
  const image = upload(doc.image);
  const document = upload(doc.document);
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
    body: bodyToText(doc.body),
    imageUrl: (image?.url as string | undefined) ?? null,
    imageAlt: (image?.alt as string | undefined) ?? null,
    imageCredit: (image?.credit as string | undefined) ?? null,
    imageCaption: (doc.imageCaption as string | undefined) ?? null,
    topics: Array.isArray(doc.topics) ? (doc.topics as string[]) : [],
    publishedAt: (doc.publishedAt as string | undefined) ?? null,
    updatedAt: String(doc.updatedAt),
    relatedLinks: editorialLinksSchema.parse(doc.relatedLinks ?? []),
    ...(collection === "publications"
      ? {
          series: optionLabel(config, "series", doc.series),
          periodStart: (doc.periodStart as string | undefined) ?? null,
          periodEnd: (doc.periodEnd as string | undefined) ?? null,
          keyFindings: Array.isArray(doc.keyFindings)
            ? (doc.keyFindings as { text: string }[]).map((row) => row.text)
            : [],
          document: document
            ? {
                url: String(document.url),
                filename: String(document.filename),
                mimeType: (document.mimeType as string | undefined) ?? null,
                filesize: (document.filesize as number | undefined) ?? null,
              }
            : null,
        }
      : {}),
  };
}
export type PublicArticle = ReturnType<typeof toArticle>;

/** Published articles, newest first, read with public access rules. */
export async function findArticles(
  payload: Payload,
  collection: ArticleCollection,
  { limit = 20, slug }: { limit?: number; slug?: string } = {}
): Promise<PublicArticle[]> {
  const result = await payload.find({
    collection,
    overrideAccess: false,
    depth: 1,
    limit: slug ? 1 : limit,
    sort: "-publishedAt",
    where: {
      status: { equals: "published" },
      ...(slug ? { slug: { equals: slug } } : {}),
    },
  });
  return result.docs.map((doc) => toArticle(collection, doc as unknown as Doc));
}

export const NO_STORE = { "Cache-Control": "no-store" };

const LINKED_HREF_COLLECTIONS = new Set([
  "questions",
  "stories",
  "publications",
]);

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
      const value = upload(item.value);
      const collection = String(item.relationTo);
      if (
        !(value && LINKED_HREF_COLLECTIONS.has(collection)) ||
        value.status !== "published"
      )
        return [];
      return [
        {
          collection,
          title: String(value.title ?? value.question),
          slug: String(value.slug),
        },
      ];
    }),
  };
}
export type PublicQuestion = ReturnType<typeof toQuestion>;

export async function findQuestions(
  payload: Payload,
  {
    limit = 50,
    slug,
    topic,
  }: { limit?: number; slug?: string; topic?: string } = {}
): Promise<PublicQuestion[]> {
  const result = await payload.find({
    collection: "questions",
    overrideAccess: false,
    depth: 1,
    limit: slug ? 1 : limit,
    sort: "-publishedAt",
    where: {
      status: { equals: "published" },
      ...(slug ? { slug: { equals: slug } } : {}),
      ...(topic ? { topics: { contains: topic } } : {}),
    },
  });
  return result.docs.map((doc) => toQuestion(doc as unknown as Doc));
}

/** The Weather now note (only while unexpired) and imagery cards. */
export async function findWeatherNow(payload: Payload, now: Date = new Date()) {
  const global = (await payload.findGlobal({
    slug: "weather-now",
    depth: 1,
    overrideAccess: false,
  })) as unknown as Doc;
  const note = (global.note ?? {}) as Doc;
  const live =
    typeof note.text === "string" &&
    note.text.trim() !== "" &&
    typeof note.expiresAt === "string" &&
    new Date(note.expiresAt) > now;
  return {
    note: live
      ? {
          text: String(note.text),
          postedAt: (note.postedAt as string | undefined) ?? null,
          expiresAt: String(note.expiresAt),
          alertUrl: (note.alertUrl as string | undefined) || null,
        }
      : null,
    imagery: (Array.isArray(global.imagery)
      ? (global.imagery as Doc[])
      : []
    ).map((row) => ({
      layer: String(row.layer),
      title: String(row.title),
      imageUrl:
        (upload(row.image)?.url as string | undefined) ??
        ((row.imageUrl as string | undefined) || null),
      href: String(row.href),
      credit: (row.credit as string | undefined) ?? null,
    })),
  };
}
export type PublicWeatherNow = Awaited<ReturnType<typeof findWeatherNow>>;

/** Homepage settings; pins arrive populated only when published. */
export async function findHomepage(payload: Payload) {
  const global = (await payload.findGlobal({
    slug: "homepage",
    depth: 1,
    overrideAccess: false,
  })) as unknown as Doc;
  const published = (value: unknown) => {
    const doc = upload(value);
    return doc && doc.status === "published" ? doc : null;
  };
  return {
    leadStory: published(global.leadStory),
    featuredQuestions: (Array.isArray(global.featuredQuestions)
      ? global.featuredQuestions
      : []
    )
      .map(published)
      .filter((doc): doc is Doc => doc !== null),
    featuredPublication: published(global.featuredPublication),
    discoverCards: Array.isArray(global.discoverCards)
      ? (global.discoverCards as string[])
      : ["sky", "on-this-day", "quiz", "fact"],
    hiddenSections: Array.isArray(global.hiddenSections)
      ? (global.hiddenSections as string[])
      : [],
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
