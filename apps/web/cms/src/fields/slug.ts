import type { CollectionBeforeValidateHook, Field } from "payload";

const SLUG = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/;

export const slugPart = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const slugField: Field = {
  name: "slug",
  type: "text",
  required: true,
  unique: true,
  index: true,
  admin: {
    position: "sidebar",
    readOnly: true,
    description: "Built from the title. Fixed once published so links last.",
  },
  validate: (value: unknown) =>
    typeof value === "string" && SLUG.test(value)
      ? true
      : "Use lowercase letters, numbers, and single hyphens.",
};

/**
 * `<prefix>/<yyyy>/<mm>/<title>` (or `<prefix>/<title>` when undated). The
 * prefix keeps slugs unique across collections, which share one URL space.
 */
export function buildSlug(
  collection: string,
  prefix: string,
  { dated = true, titleField = "title" } = {}
): CollectionBeforeValidateHook {
  return async ({ data, originalDoc, req }) => {
    if (!data) return data;
    if (originalDoc?.slug && originalDoc.status === "published") {
      data.slug = originalDoc.slug;
      return data;
    }
    const date = new Date(
      String(
        data.publishedAt ?? originalDoc?.publishedAt ?? new Date().toISOString()
      )
    );
    const parts = dated
      ? [
          prefix,
          date.getUTCFullYear(),
          String(date.getUTCMonth() + 1).padStart(2, "0"),
          data[titleField] ?? originalDoc?.[titleField],
        ]
      : [prefix, data[titleField] ?? originalDoc?.[titleField]];
    const base = parts.map(slugPart).filter(Boolean).join("/");
    const existing = await req.payload.find({
      collection: collection as "stories",
      where: { slug: { equals: base } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    data.slug =
      existing.docs[0] && existing.docs[0].id !== originalDoc?.id
        ? `${base}-${Date.now().toString(36)}`
        : base;
    return data;
  };
}
