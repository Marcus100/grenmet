import type { CollectionConfig } from "payload";
import { editorsOnly, staffOnly } from "../access";
import { mediaDirectory } from "../env";

export const Media: CollectionConfig = {
  slug: "media",
  labels: { singular: "Media", plural: "Media" },
  admin: {
    useAsTitle: "alt",
    description: "Images for GMS website articles and pages.",
  },
  access: {
    create: staffOnly,
    read: () => true,
    update: staffOnly,
    delete: editorsOnly,
  },
  upload: {
    staticDir: mediaDirectory,
    mimeTypes: ["image/*"],
  },
  fields: [
    {
      name: "alt",
      type: "text",
      required: true,
      admin: { description: "Alt text shown to screen readers." },
    },
  ],
};
