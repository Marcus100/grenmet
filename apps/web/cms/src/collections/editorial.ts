import type { CollectionConfig, Field } from "payload";
import { editContent, editorsOnly, readContent, staffOnly } from "../access";
import { relatedLinksField, validateRelatedLinks } from "../fields/common";
import { buildSlug, slugField } from "../fields/slug";
import {
  enforceReview,
  stampPublication,
  workflowFields,
} from "../fields/workflow";

/** Fields that stay last: search and social sharing settings. */
const AFTER_LINKS = new Set(["seo", "social"]);
const fieldName = (field: Field) => ("name" in field ? field.name : "");

interface EditorialOptions {
  admin: CollectionConfig["admin"];
  /** Slug includes year/month (articles) or not (evergreen questions). */
  dated?: boolean;
  fields: Field[];
  labels: CollectionConfig["labels"];
  /** URL prefix; keeps slugs unique across collections. */
  prefix: string;
  publishKey: string;
  /** Report write-ups must carry a main issued-product link. */
  requireMainProduct?: boolean;
  slug: string;
  titleField?: string;
  withLinks?: boolean;
}

/**
 * One bounded editorial collection: shared review workflow, fixed slugs,
 * validated related links and version history, plus its own fields.
 */
export function editorialCollection({
  admin,
  dated = true,
  fields,
  labels,
  prefix,
  publishKey,
  requireMainProduct = false,
  slug,
  titleField = "title",
  withLinks = true,
}: EditorialOptions): CollectionConfig {
  return {
    slug,
    labels,
    admin: {
      useAsTitle: titleField,
      defaultColumns: [titleField, "status", "publishedAt", "updatedAt"],
      ...admin,
    },
    access: {
      create: staffOnly,
      read: readContent,
      update: editContent,
      delete: editorsOnly,
      readVersions: staffOnly,
    },
    versions: { maxPerDoc: 20 },
    hooks: {
      beforeValidate: [
        stampPublication,
        buildSlug(slug, prefix, { dated, titleField }),
      ],
      beforeChange: [
        enforceReview(publishKey),
        ...(withLinks ? [validateRelatedLinks({ requireMainProduct })] : []),
      ],
    },
    // Links belong with the content, before the sharing and search settings.
    fields: [
      ...fields.filter((field) => !AFTER_LINKS.has(fieldName(field))),
      ...(withLinks ? [relatedLinksField] : []),
      ...fields.filter((field) => AFTER_LINKS.has(fieldName(field))),
      slugField,
      ...workflowFields,
    ],
  };
}
