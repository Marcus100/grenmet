import type { CollectionConfig } from "payload";
import { editorsOnly, staffOnly } from "../access";
import { mediaDirectory } from "../env";

/**
 * Media files are public and rarely change, so browsers and any cache in front
 * may keep them for a day and serve a stale copy for a week while refetching.
 * Without this every visit downloaded every picture again (issue #1233).
 */
export const MEDIA_CACHE_CONTROL =
  "public, max-age=86400, stale-while-revalidate=604800";

export function mediaResponseHeaders({ headers }: { headers: Headers }) {
  headers.set("Cache-Control", MEDIA_CACHE_CONTROL);
  return headers;
}

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
    modifyResponseHeaders: mediaResponseHeaders,
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
