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
