import type { CollectionConfig } from "payload";
import { isEditor } from "../access";
import type { PUBLICATION_ACTIONS } from "../lib/publication-log";

/**
 * Who published, unpublished or scheduled each item, and when. Written by the
 * editorial hooks only; nobody can edit or delete a record in the admin.
 */
export const PublicationLog: CollectionConfig = {
  slug: "publication-log",
  labels: { singular: "Publication record", plural: "Publication log" },
  admin: {
    group: "GMS Content",
    useAsTitle: "title",
    defaultColumns: ["createdAt", "action", "title", "actor"],
    description:
      "Written automatically each time an item is published, taken down or scheduled. Editors can read it; nobody can change it.",
  },
  access: {
    create: () => false,
    read: ({ req }) => isEditor(req.user),
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: "action",
      type: "select",
      required: true,
      options: [
        { label: "Published", value: "published" },
        { label: "Taken down", value: "unpublished" },
        { label: "Scheduled to show", value: "scheduled-publish" },
        { label: "Scheduled to come down", value: "scheduled-unpublish" },
      ] satisfies {
        label: string;
        value: (typeof PUBLICATION_ACTIONS)[number];
      }[],
    },
    { name: "collection", type: "text", required: true, maxLength: 60 },
    { name: "documentId", type: "text", required: true, maxLength: 60 },
    { name: "title", type: "text", required: true, maxLength: 200 },
    { name: "scheduledFor", type: "date" },
    {
      name: "actor",
      label: "Changed by",
      type: "relationship",
      relationTo: "users",
    },
  ],
};
