import {
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionConfig,
} from "payload";
import {
  canPublishSection,
  editContent,
  editorsOnly,
  readContent,
  staffField,
  staffOnly,
} from "../access";

const SLUG = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/;
const slugPart = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const articleCategory = (data: Record<string, unknown>) =>
  data.updateType ?? data.newsType ?? data.publicationType ?? "article";
const buildArticlePath = (data: Record<string, unknown>) => {
  const date = new Date(String(data.publishedAt ?? new Date().toISOString()));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return [data.section, articleCategory(data), year, month, data.title]
    .map(slugPart)
    .filter(Boolean)
    .join("/");
};

export const enforceReview: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
  req,
}) => {
  if (!req.user) throw new APIError("Sign in to edit content.", 403);
  if (data.status === "published") {
    if (!canPublishSection(req.user, data.section))
      throw new APIError(
        "You do not have permission to publish this article section.",
        403
      );
    if (
      originalDoc?.status !== "review" &&
      originalDoc?.status !== "published"
    ) {
      throw new APIError(
        "Submit the content for review before publishing.",
        400
      );
    }
  }
  return data;
};
export const Content: CollectionConfig = {
  slug: "content",
  labels: { singular: "Content", plural: "Content" },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "section", "status", "updatedAt"],
    description: "Articles and general pages for the GMS website.",
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
      async ({ data, originalDoc, req }) => {
        if (data) {
          if (!data.publishedAt && data.status === "published")
            data.publishedAt = new Date().toISOString();
          if (!originalDoc?.slug || originalDoc.status !== "published") {
            const base = buildArticlePath(data);
            const existing = await req.payload.find({
              collection: "content",
              where: { slug: { equals: base } },
              limit: 1,
              overrideAccess: true,
            });
            data.slug =
              existing.docs[0] && existing.docs[0].id !== originalDoc?.id
                ? `${base}-${Date.now().toString(36)}`
                : base;
          }
        }
        return data;
      },
      ({ data, operation, originalDoc, req }) => {
        if (data)
          data.author =
            operation === "create" ? req.user?.id : originalDoc?.author;
        return data;
      },
    ],
    beforeChange: [enforceReview],
  },
  fields: [
    { name: "title", type: "text", required: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: {
        description: "A URL name such as hurricane-season-preparation.",
      },
      validate: (value: unknown) =>
        typeof value === "string" && SLUG.test(value)
          ? true
          : "Use lowercase letters, numbers, and single hyphens.",
    },
    {
      name: "section",
      type: "select",
      required: true,
      defaultValue: "latest-from-us",
      options: [
        {
          label: "Latest from us — GMS updates and announcements",
          value: "latest-from-us",
        },
        {
          label: "Weather News — Grenada weather coverage",
          value: "weather-news",
        },
        {
          label: "Latest publications — long-form explanations and documents",
          value: "latest-publications",
        },
      ],
      admin: {
        description: "Choose one editorial section for this article.",
      },
    },
    {
      name: "kicker",
      type: "text",
      admin: { description: "Short label above the headline." },
    },
    {
      name: "heroCaption",
      type: "text",
      admin: { description: "Caption for the hero image." },
    },
    {
      name: "updateType",
      type: "select",
      options: [
        "Product update",
        "Service update",
        "Announcement",
        "Public notice",
        "Community update",
      ],
      admin: { condition: (data) => data.section === "latest-from-us" },
    },
    {
      name: "newsType",
      type: "select",
      options: [
        "Local weather story",
        "Weather event",
        "Climate story",
        "Weather explainer",
        "Community impact",
      ],
      admin: { condition: (data) => data.section === "weather-news" },
    },
    {
      name: "officialDocument",
      type: "upload",
      relationTo: "media",
      admin: {
        condition: (data) => data.section === "latest-publications",
        description: "Official document associated with this article.",
      },
    },
    {
      name: "publicationType",
      type: "select",
      options: [
        "Report",
        "Guide",
        "Bulletin",
        "Policy",
        "Research paper",
        "Dataset",
        "Other",
      ],
      admin: { condition: (data) => data.section === "latest-publications" },
    },
    {
      name: "publishedAt",
      type: "date",
      admin: {
        position: "sidebar",
        description: "Used to build the public article URL.",
      },
    },
    { name: "summary", type: "textarea" },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
      admin: {
        description: "Shown on news cards and the article header.",
      },
    },
    {
      name: "body",
      label: "Article body",
      type: "richText",
      required: true,
      admin: {
        description:
          "Write the article with headings, links, images, quotes, tables, and emoji.",
      },
    },
    {
      name: "socialCaption",
      type: "textarea",
      admin: { description: "Shared starting caption for social posts." },
    },
    {
      name: "social",
      type: "group",
      label: "Social media sharing",
      admin: {
        description:
          "Prepare platform-specific copy. Automatic delivery can be added later.",
      },
      fields: [
        {
          name: "enabledPlatforms",
          type: "select",
          hasMany: true,
          options: [
            "X",
            "Facebook",
            "Instagram",
            "YouTube",
            "LinkedIn",
            "WhatsApp Channel",
          ],
        },
        {
          name: "publishAt",
          type: "date",
          admin: {
            description: "Leave empty for manual or immediate sharing.",
          },
        },
        { name: "xText", type: "textarea", label: "X post" },
        { name: "facebookText", type: "textarea", label: "Facebook post" },
        { name: "instagramText", type: "textarea", label: "Instagram caption" },
        { name: "linkedinText", type: "textarea", label: "LinkedIn post" },
        {
          name: "whatsappText",
          type: "textarea",
          label: "WhatsApp Channel message",
        },
        {
          name: "youtubeTitle",
          type: "text",
          label: "YouTube title",
          admin: { condition: (data) => Boolean(data?.videoUrl) },
        },
        {
          name: "youtubeDescription",
          type: "textarea",
          label: "YouTube description",
          admin: { condition: (data) => Boolean(data?.videoUrl) },
        },
      ],
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Ready for review", value: "review" },
        { label: "Published", value: "published" },
      ],
      admin: {
        position: "sidebar",
        description:
          "Save as Ready for review. An editor checks it and publishes.",
      },
    },
    {
      name: "author",
      type: "relationship",
      relationTo: "users",
      required: true,
      admin: { readOnly: true, position: "sidebar" },
      access: { read: staffField },
    },
  ],
};
