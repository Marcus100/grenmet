import { APIError, type CollectionBeforeChangeHook, type Field } from "payload";
import { getEnv } from "../env";
import { editorialLinksSchema } from "../lib/editorial-links";
import { labelFor } from "../lib/link-titles";

/** One list, so questions, stories and reports can point at each other. */
export const TOPICS = [
  { label: "Hurricanes and tropical weather", value: "tropical" },
  { label: "Rain and flooding", value: "rain" },
  { label: "Heat and sun", value: "heat" },
  { label: "Sea and coast", value: "marine" },
  { label: "Climate", value: "climate" },
  { label: "Sky and space", value: "sky" },
  { label: "Safety and preparedness", value: "safety" },
  { label: "Farming and water", value: "agriculture" },
  { label: "Aviation", value: "aviation" },
  { label: "How GMS works", value: "gms" },
] as const;

export const topicsField: Field = {
  name: "topics",
  type: "select",
  hasMany: true,
  options: [...TOPICS],
  admin: {
    description: "Used to link related questions, stories and reports.",
  },
};

export function coverFields({ required = false } = {}): Field[] {
  return [
    {
      name: "image",
      type: "upload",
      relationTo: "media",
      required,
      admin: { description: "Shown on cards and at the top of the page." },
    },
    {
      name: "imageCaption",
      type: "text",
      maxLength: 200,
    },
  ];
}

export const summaryField = (maxLength: number): Field => ({
  name: "summary",
  type: "textarea",
  required: true,
  maxLength,
  admin: {
    description: `Shown on cards and in search. ${maxLength} characters at most.`,
  },
});

export const bodyField = (required = true): Field => ({
  name: "body",
  label: "Body",
  type: "richText",
  required,
});

export const relatedLinksField: Field = {
  name: "relatedLinks",
  type: "array",
  maxRows: 20,
  labels: { singular: "Link", plural: "Related links" },
  admin: {
    description:
      "Paste a link: a GMS product (an issued forecast, outlook or bulletin), a warning, any page of the GMS site, or somewhere else. Pasted GMS products and warnings show their live details on the site. Tick Main link on one to show it as a card. Linking does not publish the destination.",
  },
  fields: [
    {
      name: "url",
      label: "Link",
      type: "text",
      required: true,
      maxLength: 2000,
      admin: {
        description:
          "Paste the address from your browser, for example a product page on weather.barrels.gd.",
      },
    },
    {
      name: "title",
      type: "text",
      maxLength: 200,
      admin: {
        description:
          "Leave blank to fill in automatically (a product's name and issue time, a warning's headline, a page's title).",
      },
    },
    {
      name: "category",
      type: "select",
      options: [
        { label: "Forecast", value: "forecast" },
        { label: "CAP alert", value: "cap" },
        { label: "Aviation", value: "aviation" },
        { label: "Bulletin", value: "bulletin" },
        { label: "Publication", value: "publication" },
        { label: "Article", value: "article" },
        { label: "News source", value: "source" },
      ],
      admin: { description: "Leave blank to fill in automatically." },
    },
    {
      name: "isMain",
      type: "checkbox",
      label: "Main link",
      defaultValue: false,
      admin: {
        description:
          "Show this one as a card with its live details. Only one per post; it must be a GMS product, warning or page.",
      },
    },
  ],
};

/**
 * Checks a post's related links, works out each one's kind from its address,
 * fills in blank titles and categories, and (for report write-ups) requires a
 * main issued product. Product and warning names come from the forecast
 * system and fall back to a plain label if it cannot be reached.
 */
export const validateRelatedLinks =
  ({
    requireMainProduct = false,
  }: {
    requireMainProduct?: boolean;
  } = {}): CollectionBeforeChangeHook =>
  async ({ data, originalDoc }) => {
    const result = editorialLinksSchema.safeParse(
      data.relatedLinks ?? originalDoc?.relatedLinks ?? []
    );
    if (!result.success)
      throw new APIError(
        result.error.issues[0]?.message ??
          "Check the related links (maximum 20).",
        400
      );
    if (
      requireMainProduct &&
      !result.data.some((link) => link.type === "product" && link.isMain)
    )
      throw new APIError(
        "Paste the issued report this write-up is about and tick Main link.",
        400
      );
    if (!data.relatedLinks) return data;
    const baseURL = getEnv().AUTH_API_URL;
    // Preserve Payload row IDs while filling in what the editor left blank.
    data.relatedLinks = await Promise.all(
      data.relatedLinks.map(
        async (row: Record<string, unknown>, index: number) => {
          const link = result.data[index];
          if (!link) return row;
          const blank = {
            title: !String(row.title ?? "").trim(),
            category: !row.category,
          };
          const label =
            blank.title || blank.category
              ? await labelFor(link, baseURL)
              : null;
          return {
            ...row,
            url: link.url,
            isMain: link.isMain,
            title: blank.title ? label?.title : link.title,
            category: blank.category ? label?.category : link.category,
          };
        }
      )
    );
    return data;
  };

export const seoField: Field = {
  name: "seo",
  type: "group",
  label: "Search and sharing",
  admin: {
    description: "Optional. Falls back to the title, summary and image.",
  },
  fields: [
    { name: "title", type: "text", maxLength: 70 },
    { name: "description", type: "textarea", maxLength: 160 },
    { name: "image", type: "upload", relationTo: "media" },
  ],
};

export const socialField: Field = {
  name: "social",
  type: "group",
  label: "Social media sharing",
  admin: {
    description:
      "Download the main link's images, then prepare platform-specific copy. Automatic delivery can be added later.",
  },
  fields: [
    {
      name: "attachments",
      type: "ui",
      admin: {
        components: {
          Field: "/components/social-attachments#SocialAttachments",
        },
      },
    },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
      label: "Custom image",
      admin: {
        description:
          "Optional. Replaces the warning's social image when the post is shared.",
      },
    },
    { name: "caption", type: "textarea", label: "Shared starting caption" },
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
      admin: { description: "Leave empty for manual or immediate sharing." },
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
  ],
};
