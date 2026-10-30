import type {
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  Field,
} from "payload";
import { editContent, editorsOnly, readContent, staffOnly } from "../access";
import { getEnv } from "../env";
import { relatedLinksField, validateRelatedLinks } from "../fields/common";
import { buildSlug, slugField } from "../fields/slug";
import {
  enforceReview,
  stampPublication,
  workflowFields,
} from "../fields/workflow";
import { isPreviewCollection, previewHref } from "../lib/preview-link";
import { recordPublication } from "../lib/publication-log";
import { distributeForSocial } from "../lib/social-distribution";

/** Fields that stay last: search and social sharing settings. */
const AFTER_LINKS = new Set(["seo", "social"]);
const fieldName = (field: Field) => ("name" in field ? field.name : "");

interface EditorialOptions {
  access?: CollectionConfig["access"];
  admin: CollectionConfig["admin"];
  /** Runs after the shared hooks, before saving. */
  beforeChange?: CollectionBeforeChangeHook[];
  /** Runs after the shared hooks, before validation. */
  beforeValidate?: CollectionBeforeValidateHook[];
  /** Slug includes year/month (articles) or not (evergreen questions). */
  dated?: boolean;
  fields: Field[];
  labels: CollectionConfig["labels"];
  /** URL prefix; keeps slugs unique across collections. */
  prefix: string;
  publishKey: string;
  /** Report write-ups must carry a main issued-product link. */
  requireMainProduct?: boolean;
  /** Replaces the standard review rule (the duty note has its own). */
  review?: CollectionBeforeChangeHook;
  slug: string;
  titleField?: string;
  withLinks?: boolean;
}

/**
 * One bounded editorial collection: shared review workflow, fixed slugs,
 * validated related links, publication log and version history, plus its own
 * fields.
 */
export function editorialCollection({
  access,
  admin,
  beforeChange = [],
  beforeValidate = [],
  dated = true,
  fields,
  labels,
  prefix,
  publishKey,
  review,
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
      // "Preview on the real site": a signed, short-lived link. No button
      // unless the weather site's preview address is configured.
      preview: isPreviewCollection(slug)
        ? (doc) => {
            const env = getEnv();
            return previewHref({
              collection: slug,
              id: String(doc.id),
              secret: env.PAYLOAD_SECRET,
              siteUrl: env.GMS_PREVIEW_URL,
            });
          }
        : undefined,
      ...admin,
    },
    access: {
      create: staffOnly,
      read: readContent,
      update: editContent,
      delete: editorsOnly,
      readVersions: staffOnly,
      ...access,
    },
    versions: { maxPerDoc: 20 },
    hooks: {
      beforeValidate: [
        stampPublication,
        buildSlug(slug, prefix, { dated, titleField }),
        ...beforeValidate,
      ],
      beforeChange: [
        review ?? enforceReview(publishKey),
        ...(withLinks ? [validateRelatedLinks({ requireMainProduct })] : []),
        ...beforeChange,
      ],
      afterChange: [
        recordPublication(slug, titleField),
        distributeForSocial(slug),
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
