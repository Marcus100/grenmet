import type { CollectionConfig } from "payload";
import { editorsOnly, staffOnly } from "../access";
import { mediaDirectory } from "../env";

export const Media: CollectionConfig = {
  slug: "media",
  labels: { singular: "Media", plural: "Media" },
  admin: {
    useAsTitle: "alt",
    description: "Images and documents for GMS website content.",
  },
  access: {
    create: staffOnly,
    read: () => true,
    update: staffOnly,
    delete: editorsOnly,
  },
  upload: {
    staticDir: mediaDirectory,
    mimeTypes: [
      "image/*",
      "application/pdf",
      "text/plain",
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "video/mp4",
    ],
  },
  fields: [
    {
      name: "alt",
      type: "text",
      required: true,
      admin: { description: "Alt text shown to screen readers." },
    },
    {
      name: "credit",
      type: "text",
      maxLength: 120,
      admin: {
        description:
          'Who made or supplied it, e.g. "GMS / J. Pryce" or "NOAA".',
      },
    },
  ],
};
