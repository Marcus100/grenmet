import type { GlobalConfig } from "payload";
import { HOMEPAGE_KEY, hasPermission } from "../access";

export const HOMEPAGE_SECTIONS = [
  { label: "Weather now", value: "weather-now" },
  { label: "From the Desk", value: "desk" },
  { label: "Stories", value: "stories" },
  { label: "Questions about the weather", value: "questions" },
  { label: "News", value: "discover" },
  { label: "Latest reports", value: "reports" },
  { label: "Explore today", value: "explore-today" },
  { label: "Grenada in data", value: "grenada-in-data" },
] as const;

/** Payload field names cannot contain hyphens. */
export const copyFieldName = (key: string) => key.replaceAll("-", "_");

export const DISCOVER_CARDS = [
  { label: "Tonight's sky", value: "sky" },
  { label: "On this day", value: "on-this-day" },
  { label: "Quiz", value: "quiz" },
  { label: "Did you know", value: "fact" },
] as const;

/** Section wording and visibility; what leads a section is set on the posts. */
export const Homepage: GlobalConfig = {
  slug: "homepage",
  label: "Section wording & visibility",
  admin: {
    group: "GMS Content",
    description:
      "Change the wording of a homepage section, choose which Discover cards show, or hide a section (for example during a hurricane). What leads a section is set on the posts themselves: Lead story on Stories, Featured on Questions.",
  },
  access: {
    read: () => true,
    update: ({ req }) => hasPermission(req.user, HOMEPAGE_KEY),
    readVersions: ({ req }) => Boolean(req.user),
  },
  versions: { max: 20 },
  fields: [
    {
      name: "discoverCards",
      type: "select",
      hasMany: true,
      options: [...DISCOVER_CARDS],
      defaultValue: DISCOVER_CARDS.map((card) => card.value),
      admin: {
        description: "Which cards News shows.",
      },
    },
    {
      name: "sectionCopy",
      type: "group",
      label: "Section wording",
      admin: {
        description:
          "Words only: figures and statuses come from the forecast system. Leave a field empty to keep the standard wording.",
      },
      fields: HOMEPAGE_SECTIONS.map((section) => ({
        name: copyFieldName(section.value),
        label: section.label,
        type: "group" as const,
        admin: { hideGutter: true },
        fields: [
          { name: "kicker", type: "text" as const, maxLength: 40 },
          { name: "title", type: "text" as const, maxLength: 80 },
          { name: "intro", type: "textarea" as const, maxLength: 240 },
        ],
      })),
    },
    {
      name: "hiddenSections",
      type: "select",
      hasMany: true,
      options: [...HOMEPAGE_SECTIONS],
      admin: { description: "Sections to hide from the homepage for now." },
    },
  ],
};
