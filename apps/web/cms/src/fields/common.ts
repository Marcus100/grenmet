import { APIError, type CollectionBeforeChangeHook, type Field } from "payload";
import { editorialLinksSchema } from "../lib/editorial-links";

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
  admin: {
    description:
      "Link to an existing product, publication or news source. Linking does not publish the destination.",
  },
  fields: [
    { name: "title", type: "text", required: true, maxLength: 200 },
    {
      name: "category",
      type: "select",
      required: true,
      options: [
        { label: "Forecast", value: "forecast" },
        { label: "CAP alert", value: "cap" },
        { label: "Aviation", value: "aviation" },
        { label: "Bulletin", value: "bulletin" },
        { label: "Publication", value: "publication" },
        { label: "Article", value: "article" },
        { label: "News source", value: "source" },
      ],
    },
    {
      name: "url",
      label: "Destination URL",
      type: "text",
      required: true,
      maxLength: 2000,
    },
  ],
};

export const validateRelatedLinks: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
}) => {
  const result = editorialLinksSchema.safeParse(
    data.relatedLinks ?? originalDoc?.relatedLinks ?? []
  );
  if (!result.success)
    throw new APIError(
      "Related links need a category, title and full HTTP or HTTPS URL without credentials (maximum 20 links).",
      400
    );
  // Preserve Payload row IDs when normalizing editable values.
  if (data.relatedLinks)
    data.relatedLinks = data.relatedLinks.map(
      (row: Record<string, unknown>, index: number) => ({
        ...row,
        ...result.data[index],
      })
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
      "Prepare platform-specific copy. Automatic delivery can be added later.",
  },
  fields: [
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
