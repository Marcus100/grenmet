import {
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionConfig,
} from "payload";
import {
  editContent,
  editorsOnly,
  isEditor,
  readContent,
  staffField,
  staffOnly,
} from "../access";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const enforceReview: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
  req,
}) => {
  if (!req.user) throw new APIError("Sign in to edit content.", 403);
  if (data.status === "published") {
    if (!isEditor(req.user))
      throw new APIError("An editor must publish this content.", 403);
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
    defaultColumns: ["title", "kind", "status", "updatedAt"],
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
      name: "kind",
      type: "select",
      required: true,
      defaultValue: "article",
      options: [
        { label: "Article / blog", value: "article" },
        { label: "General page", value: "page" },
      ],
    },
    { name: "summary", type: "textarea" },
    {
      name: "body",
      label: "Markdown",
      type: "textarea",
      required: true,
      admin: {
        rows: 20,
        description: "Write Markdown. Open Preview below to check formatting.",
      },
    },
    {
      name: "preview",
      type: "ui",
      admin: {
        components: { Field: "/components/markdown-preview#MarkdownPreview" },
      },
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
